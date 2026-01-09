/**
 * Cloudflare D1 caching layer for translations.
 */

import { drizzle } from "drizzle-orm/d1";
import { eq, desc, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import {
	newsTranslations,
	translationLocks,
	glossary,
	type NewsTranslation,
	type GlossaryEntry as SchemaGlossaryEntry,
} from "./legacy-schema";
import type { CachedTranslation } from "./types";

/** How long to wait for an in-progress translation (ms) */
const TRANSLATION_WAIT_TIMEOUT_MS = 60_000;

/** Polling interval when waiting for translation (ms) */
const TRANSLATION_POLL_INTERVAL_MS = 500;

/** Max age for a stale translation lock before we consider it abandoned (ms) */
const TRANSLATION_LOCK_TIMEOUT_MS = 120_000;

/**
 * D1-based cache for DQX news translations using Drizzle ORM.
 */
export class D1Cache {
	private db: DrizzleD1Database;

	constructor(d1: D1Database) {
		this.db = drizzle(d1);
	}

	/**
	 * Get cached translation by news ID.
	 */
	async getTranslation(newsId: string): Promise<CachedTranslation | null> {
		const result = await this.db
			.select()
			.from(newsTranslations)
			.where(eq(newsTranslations.newsId, newsId))
			.get();

		if (!result) return null;

		// Map Drizzle result to CachedTranslation format
		return {
			news_id: result.newsId,
			content_hash: result.contentHash,
			title_ja: result.titleJa,
			title_en: result.titleEn,
			content_ja: result.contentJa,
			content_en: result.contentEn,
			category: result.category,
			date: result.date,
			url: result.url,
			created_at: result.createdAt,
			updated_at: result.updatedAt,
		};
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
			.insert(newsTranslations)
			.values({
				newsId: params.newsId,
				contentHash: params.contentHash,
				titleJa: params.titleJa,
				titleEn: params.titleEn,
				contentJa: params.contentJa ?? null,
				contentEn: params.contentEn ?? null,
				category: params.category,
				date: params.date,
				url: params.url,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: newsTranslations.newsId,
				set: {
					contentHash: params.contentHash,
					titleJa: params.titleJa,
					titleEn: params.titleEn,
					contentJa: params.contentJa ?? null,
					contentEn: params.contentEn ?? null,
					category: params.category,
					date: params.date,
					url: params.url,
					updatedAt: now,
				},
			});
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

		const query = this.db
			.select()
			.from(newsTranslations)
			.$dynamic();

		const results = await (category
			? query.where(eq(newsTranslations.category, category))
			: query
		)
			.orderBy(desc(newsTranslations.date))
			.limit(limit)
			.offset(offset)
			.all();

		// Map results to CachedTranslation format
		return results.map((result) => ({
			news_id: result.newsId,
			content_hash: result.contentHash,
			title_ja: result.titleJa,
			title_en: result.titleEn,
			content_ja: result.contentJa,
			content_en: result.contentEn,
			category: result.category,
			date: result.date,
			url: result.url,
			created_at: result.createdAt,
			updated_at: result.updatedAt,
		}));
	}

	/**
	 * Get total count of cached items.
	 */
	async getCount(category?: string | null): Promise<number> {
		const query = this.db
			.select({ count: sql<number>`count(*)` })
			.from(newsTranslations)
			.$dynamic();

		const result = await (category
			? query.where(eq(newsTranslations.category, category))
			: query
		).get();

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
			.select()
			.from(translationLocks)
			.where(eq(translationLocks.newsId, newsId))
			.get();

		if (!lock) return false;

		// Check if lock is stale
		const lockedAt = new Date(lock.lockedAt);
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
		const staleThreshold = new Date(
			Date.now() - TRANSLATION_LOCK_TIMEOUT_MS
		).toISOString();

		// Clean up any stale locks first
		await this.db
			.delete(translationLocks)
			.where(sql`${translationLocks.lockedAt} < ${staleThreshold}`);

		// Try to insert a lock - will fail if one exists
		try {
			await this.db.insert(translationLocks).values({
				newsId,
				lockedAt: now,
			});
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
			.delete(translationLocks)
			.where(eq(translationLocks.newsId, newsId));
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

	// ============ Glossary Operations ============

	/**
	 * Update the glossary with new entries (full replacement).
	 * Clears existing entries and inserts new ones.
	 */
	async updateGlossary(
		entries: Array<{ japanese_text: string; english_text: string }>
	): Promise<number> {
		const now = new Date().toISOString();

		// Clear existing glossary
		await this.db.delete(glossary);

		// Insert in batches to avoid hitting query limits
		const BATCH_SIZE = 100;
		let inserted = 0;

		for (let i = 0; i < entries.length; i += BATCH_SIZE) {
			const batch = entries.slice(i, i + BATCH_SIZE);

			await this.db.insert(glossary).values(
				batch.map((e) => ({
					japaneseText: e.japanese_text,
					englishText: e.english_text,
					updatedAt: now,
				}))
			);

			inserted += batch.length;
		}

		return inserted;
	}

	/**
	 * Find glossary entries that match substrings in the given text.
	 * Returns entries where the Japanese text appears in the input.
	 */
	async findMatchingGlossaryEntries(
		text: string
	): Promise<Array<{ japanese_text: string; english_text: string }>> {
		if (!text.trim()) return [];

		// Get all glossary entries and filter in-memory for substring matching
		// D1 doesn't support efficient substring search, so we fetch all and filter
		const entries = await this.db
			.select({
				japanese_text: glossary.japaneseText,
				english_text: glossary.englishText,
			})
			.from(glossary)
			.all();

		return entries.filter((entry) => text.includes(entry.japanese_text));
	}

	/**
	 * Get the count of glossary entries.
	 */
	async getGlossaryCount(): Promise<number> {
		const result = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(glossary)
			.get();
		return result?.count ?? 0;
	}

	/**
	 * Get all glossary entries (for debugging/admin).
	 */
	async getAllGlossaryEntries(
		limit: number = 100,
		offset: number = 0
	): Promise<Array<{ japanese_text: string; english_text: string; updated_at: string }>> {
		const entries = await this.db
			.select({
				japanese_text: glossary.japaneseText,
				english_text: glossary.englishText,
				updated_at: glossary.updatedAt,
			})
			.from(glossary)
			.limit(limit)
			.offset(offset)
			.all();
		return entries;
	}
}
