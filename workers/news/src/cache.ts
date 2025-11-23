/**
 * Cloudflare D1 caching layer for translations.
 */

import type { CachedTranslation } from "./types";

/** Marker used to indicate a translation is in progress */
const TRANSLATING_MARKER = "__TRANSLATING__";

/** How long to wait for an in-progress translation (ms) */
const TRANSLATION_WAIT_TIMEOUT_MS = 60_000;

/** Polling interval when waiting for translation (ms) */
const TRANSLATION_POLL_INTERVAL_MS = 500;

/** Max age for a stale translation lock before we consider it abandoned (ms) */
const TRANSLATION_LOCK_TIMEOUT_MS = 120_000;

const CREATE_TABLE_SQL = `
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
		await this.db.prepare(CREATE_TABLE_SQL).run();
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

	/**
	 * Check if a cached entry represents an in-progress translation.
	 */
	isTranslating(cached: CachedTranslation): boolean {
		return cached.content_hash === TRANSLATING_MARKER;
	}

	/**
	 * Check if a translation lock is stale (abandoned).
	 */
	private isLockStale(cached: CachedTranslation): boolean {
		try {
			const updated = new Date(cached.updated_at);
			const now = new Date();
			return now.getTime() - updated.getTime() > TRANSLATION_LOCK_TIMEOUT_MS;
		} catch {
			return true;
		}
	}

	/**
	 * Try to acquire a translation lock for a news item.
	 * Returns true if lock was acquired, false if another worker is already translating.
	 */
	async tryAcquireTranslationLock(newsId: string): Promise<boolean> {
		const now = new Date().toISOString();

		// First check if there's an existing entry
		const existing = await this.getTranslation(newsId);

		if (existing) {
			// If it's translating and the lock is not stale, someone else has it
			if (this.isTranslating(existing) && !this.isLockStale(existing)) {
				return false;
			}

			// If it has content and hash isn't the marker, it's already translated
			if (existing.content_en && existing.content_hash !== TRANSLATING_MARKER) {
				return false;
			}

			// Lock is stale or entry needs translation - try to update it
			const result = await this.db
				.prepare(
					`
					UPDATE news_translations
					SET content_hash = ?, updated_at = ?
					WHERE news_id = ?
					AND (content_hash = ? OR content_hash = ? OR updated_at < ?)
					`
				)
				.bind(
					TRANSLATING_MARKER,
					now,
					newsId,
					TRANSLATING_MARKER, // Was already translating (stale)
					existing.content_hash, // Hasn't changed
					new Date(Date.now() - TRANSLATION_LOCK_TIMEOUT_MS).toISOString()
				)
				.run();

			return (result.meta.changes ?? 0) > 0;
		}

		// No existing entry - try to insert a new lock
		try {
			await this.db
				.prepare(
					`
					INSERT INTO news_translations
						(news_id, content_hash, title_ja, title_en, category, date, url, created_at, updated_at)
					VALUES (?, ?, '', '', '', '', '', ?, ?)
					`
				)
				.bind(newsId, TRANSLATING_MARKER, now, now)
				.run();
			return true;
		} catch {
			// Insert failed - likely a race condition where another worker inserted first
			return false;
		}
	}

	/**
	 * Wait for an in-progress translation to complete.
	 * Returns the completed translation, or null if timeout/error.
	 */
	async waitForTranslation(newsId: string): Promise<CachedTranslation | null> {
		const startTime = Date.now();

		while (Date.now() - startTime < TRANSLATION_WAIT_TIMEOUT_MS) {
			const cached = await this.getTranslation(newsId);

			if (!cached) {
				// Entry was deleted - translation failed
				return null;
			}

			if (!this.isTranslating(cached)) {
				// Translation complete
				return cached;
			}

			if (this.isLockStale(cached)) {
				// Lock is stale - translation likely failed
				return null;
			}

			// Still translating - wait and poll again
			await new Promise((resolve) =>
				setTimeout(resolve, TRANSLATION_POLL_INTERVAL_MS)
			);
		}

		// Timeout
		return null;
	}

	/**
	 * Release a translation lock by deleting the placeholder entry.
	 * Call this if translation fails after acquiring the lock.
	 */
	async releaseTranslationLock(newsId: string): Promise<void> {
		await this.db
			.prepare(
				`DELETE FROM news_translations WHERE news_id = ? AND content_hash = ?`
			)
			.bind(newsId, TRANSLATING_MARKER)
			.run();
	}
}
