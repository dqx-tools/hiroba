/**
 * Cloudflare D1 caching layer for translations.
 */

import type { CachedTranslation } from "./types";

/** How long to wait for an in-progress translation (ms) */
const TRANSLATION_WAIT_TIMEOUT_MS = 60_000;

/** Polling interval when waiting for translation (ms) */
const TRANSLATION_POLL_INTERVAL_MS = 500;

/** Max age for a stale translation lock before we consider it abandoned (ms) */
const TRANSLATION_LOCK_TIMEOUT_MS = 120_000;

const CREATE_TRANSLATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS news_translations (
    news_id TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    title_ja TEXT NOT NULL,
    title_en TEXT NOT NULL,
    content_ja TEXT,
    content_en TEXT,
    category TEXT NOT NULL,
    date TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
`;

const CREATE_LOCKS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS translation_locks (
    news_id TEXT PRIMARY KEY,
    locked_at TEXT NOT NULL
);
`;

const CREATE_INDEX_SQLS = [
	"CREATE INDEX IF NOT EXISTS idx_news_category ON news_translations(category)",
	"CREATE INDEX IF NOT EXISTS idx_news_date ON news_translations(date DESC)",
	"CREATE INDEX IF NOT EXISTS idx_news_updated ON news_translations(updated_at DESC)",
];

/**
 * D1-based cache for DQX news translations.
 */
export class D1Cache {
	constructor(private db: D1Database) {}

	/**
	 * Initialize the database schema.
	 */
	async initialize(): Promise<void> {
		await this.db.prepare(CREATE_TRANSLATIONS_TABLE_SQL).run();
		await this.db.prepare(CREATE_LOCKS_TABLE_SQL).run();
		for (const sql of CREATE_INDEX_SQLS) {
			await this.db.prepare(sql).run();
		}
	}

	/**
	 * Get cached translation by news ID.
	 */
	async getTranslation(newsId: string): Promise<CachedTranslation | null> {
		const result = await this.db
			.prepare("SELECT * FROM news_translations WHERE news_id = ?")
			.bind(newsId)
			.first<CachedTranslation>();

		return result ?? null;
	}

	/**
	 * Get cached translation only if content hash matches.
	 */
	async getTranslationIfValid(
		newsId: string,
		contentHash: string
	): Promise<CachedTranslation | null> {
		const cached = await this.getTranslation(newsId);
		if (cached && cached.content_hash === contentHash) {
			return cached;
		}
		return null;
	}

	/**
	 * Save or update a translation in the cache.
	 */
	async saveTranslation(params: {
		newsId: string;
		contentHash: string;
		titleJa: string;
		titleEn: string;
		category: string;
		date: string;
		url: string;
		contentJa?: string | null;
		contentEn?: string | null;
	}): Promise<void> {
		const now = new Date().toISOString();

		await this.db
			.prepare(
				`
				INSERT INTO news_translations
					(news_id, content_hash, title_ja, title_en, content_ja, content_en,
					 category, date, url, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(news_id) DO UPDATE SET
					content_hash = excluded.content_hash,
					title_ja = excluded.title_ja,
					title_en = excluded.title_en,
					content_ja = excluded.content_ja,
					content_en = excluded.content_en,
					category = excluded.category,
					date = excluded.date,
					url = excluded.url,
					updated_at = excluded.updated_at
			`
			)
			.bind(
				params.newsId,
				params.contentHash,
				params.titleJa,
				params.titleEn,
				params.contentJa ?? null,
				params.contentEn ?? null,
				params.category,
				params.date,
				params.url,
				now,
				now
			)
			.run();
	}

	/**
	 * Get cached news listings with optional filtering.
	 */
	async getListings(params: {
		category?: string | null;
		limit?: number;
		offset?: number;
	}): Promise<CachedTranslation[]> {
		const { category, limit = 50, offset = 0 } = params;

		let stmt: D1PreparedStatement;
		if (category) {
			stmt = this.db
				.prepare(
					`
					SELECT * FROM news_translations
					WHERE category = ?
					ORDER BY date DESC
					LIMIT ? OFFSET ?
				`
				)
				.bind(category, limit, offset);
		} else {
			stmt = this.db
				.prepare(
					`
					SELECT * FROM news_translations
					ORDER BY date DESC
					LIMIT ? OFFSET ?
				`
				)
				.bind(limit, offset);
		}

		const result = await stmt.all<CachedTranslation>();
		return result.results ?? [];
	}

	/**
	 * Get total count of cached items.
	 */
	async getCount(category?: string | null): Promise<number> {
		let stmt: D1PreparedStatement;
		if (category) {
			stmt = this.db
				.prepare(
					"SELECT COUNT(*) as count FROM news_translations WHERE category = ?"
				)
				.bind(category);
		} else {
			stmt = this.db.prepare(
				"SELECT COUNT(*) as count FROM news_translations"
			);
		}

		const result = await stmt.first<{ count: number }>();
		return result?.count ?? 0;
	}

	/**
	 * Check if cache entry needs revalidation based on updated_at timestamp.
	 */
	isCacheStale(cached: CachedTranslation, maxAgeHours: number = 6): boolean {
		try {
			const updated = new Date(cached.updated_at);
			const now = new Date();
			const ageHours =
				(now.getTime() - updated.getTime()) / (1000 * 60 * 60);
			return ageHours > maxAgeHours;
		} catch {
			return true; // Revalidate if we can't parse the timestamp
		}
	}

	// ============ Translation Locking ============

	/**
	 * Check if a news item is currently being translated.
	 */
	async isTranslationLocked(newsId: string): Promise<boolean> {
		const lock = await this.db
			.prepare("SELECT locked_at FROM translation_locks WHERE news_id = ?")
			.bind(newsId)
			.first<{ locked_at: string }>();

		if (!lock) return false;

		// Check if lock is stale
		const lockedAt = new Date(lock.locked_at);
		const now = new Date();
		if (now.getTime() - lockedAt.getTime() > TRANSLATION_LOCK_TIMEOUT_MS) {
			// Stale lock - clean it up
			await this.releaseTranslationLock(newsId);
			return false;
		}

		return true;
	}

	/**
	 * Try to acquire a translation lock for a news item.
	 * Returns true if lock was acquired, false if another worker is already translating.
	 */
	async tryAcquireTranslationLock(newsId: string): Promise<boolean> {
		const now = new Date().toISOString();

		// Clean up any stale locks first
		await this.db
			.prepare(
				"DELETE FROM translation_locks WHERE locked_at < ?"
			)
			.bind(new Date(Date.now() - TRANSLATION_LOCK_TIMEOUT_MS).toISOString())
			.run();

		// Try to insert a lock - will fail if one exists
		try {
			await this.db
				.prepare(
					"INSERT INTO translation_locks (news_id, locked_at) VALUES (?, ?)"
				)
				.bind(newsId, now)
				.run();
			return true;
		} catch {
			// Lock already exists
			return false;
		}
	}

	/**
	 * Release a translation lock.
	 */
	async releaseTranslationLock(newsId: string): Promise<void> {
		await this.db
			.prepare("DELETE FROM translation_locks WHERE news_id = ?")
			.bind(newsId)
			.run();
	}

	/**
	 * Wait for an in-progress translation to complete.
	 * Returns the completed translation, or null if timeout/error.
	 */
	async waitForTranslation(newsId: string): Promise<CachedTranslation | null> {
		const startTime = Date.now();

		while (Date.now() - startTime < TRANSLATION_WAIT_TIMEOUT_MS) {
			// Check if lock is still held
			const isLocked = await this.isTranslationLocked(newsId);

			if (!isLocked) {
				// Lock released - check if we have a translation now
				const cached = await this.getTranslation(newsId);
				if (cached?.content_en) {
					return cached;
				}
				// No translation - the other worker must have failed
				return null;
			}

			// Still locked - wait and poll again
			await new Promise((resolve) =>
				setTimeout(resolve, TRANSLATION_POLL_INTERVAL_MS)
			);
		}

		// Timeout
		return null;
	}
}
