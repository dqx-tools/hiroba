/**
 * Database operations for news items using Drizzle ORM.
 *
 * Handles upserts from list scraping and queries for API endpoints.
 */

import { eq, desc, and, lt, sql, isNotNull } from "drizzle-orm";
import { newsItems, translations, type Database } from "@hiroba/db";
import { isDueForCheck, getNextCheckTime, type ListItem, type NewsItem, type Category } from "@hiroba/shared";

/**
 * Upsert news items from list scraping.
 * Returns items that were newly inserted (not updates to existing).
 */
export async function upsertListItems(
	db: Database,
	items: ListItem[],
): Promise<ListItem[]> {
	const now = Math.floor(Date.now() / 1000);
	const newlyInserted: ListItem[] = [];

	for (const item of items) {
		// Check if item exists before upserting
		const existing = await db
			.select({ id: newsItems.id })
			.from(newsItems)
			.where(eq(newsItems.id, item.id))
			.get();

		await db
			.insert(newsItems)
			.values({
				id: item.id,
				titleJa: item.titleJa,
				category: item.category,
				publishedAt: item.publishedAt,
				listCheckedAt: now,
			})
			.onConflictDoUpdate({
				target: newsItems.id,
				set: {
					listCheckedAt: now,
				},
			});

		// Track if this was a new insert
		if (!existing) {
			newlyInserted.push(item);
		}
	}

	return newlyInserted;
}

/**
 * Get paginated list of news items.
 */
export async function getNewsItems(
	db: Database,
	options: {
		category?: Category;
		limit?: number;
		cursor?: string;
	} = {},
): Promise<{ items: NewsItem[]; hasMore: boolean; nextCursor?: string }> {
	const limit = Math.min(options.limit ?? 20, 100);

	// Build base query with dynamic conditions
	const conditions = [];

	if (options.category) {
		conditions.push(eq(newsItems.category, options.category));
	}

	if (options.cursor) {
		const cursorTime = parseInt(options.cursor, 10);
		conditions.push(lt(newsItems.publishedAt, cursorTime));
	}

	const query = db
		.select()
		.from(newsItems)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(newsItems.publishedAt))
		.limit(limit + 1);

	const results = await query.all();
	const hasMore = results.length > limit;
	const dbItems = hasMore ? results.slice(0, -1) : results;

	// Map database schema to shared NewsItem type
	const items: NewsItem[] = dbItems.map((row) => ({
		id: row.id,
		titleJa: row.titleJa,
		category: row.category as Category,
		publishedAt: row.publishedAt,
		listCheckedAt: row.listCheckedAt,
		contentJa: row.contentJa,
		sourceUpdatedAt: row.sourceUpdatedAt,
		bodyFetchedAt: row.bodyFetchedAt,
	}));

	return {
		items,
		hasMore,
		nextCursor: hasMore
			? String(items[items.length - 1].publishedAt)
			: undefined,
	};
}

/**
 * Get a single news item by ID.
 */
export async function getNewsItem(
	db: Database,
	id: string,
): Promise<NewsItem | null> {
	const result = await db
		.select()
		.from(newsItems)
		.where(eq(newsItems.id, id))
		.get();

	if (!result) return null;

	return {
		id: result.id,
		titleJa: result.titleJa,
		category: result.category as Category,
		publishedAt: result.publishedAt,
		listCheckedAt: result.listCheckedAt,
		contentJa: result.contentJa,
		sourceUpdatedAt: result.sourceUpdatedAt,
		bodyFetchedAt: result.bodyFetchedAt,
	};
}

/**
 * Get stats for admin dashboard.
 */
export async function getStats(db: Database): Promise<{
	totalItems: number;
	itemsWithBody: number;
	itemsTranslated: number;
	itemsPendingRecheck: number;
	byCategory: Record<string, number>;
}> {
	const [totalResult, withBodyResult, translatedResult, categoryResults] =
		await Promise.all([
			// Total count
			db.select({ count: sql<number>`count(*)` }).from(newsItems).get(),
			// Items with body content
			db
				.select({ count: sql<number>`count(*)` })
				.from(newsItems)
				.where(isNotNull(newsItems.contentJa))
				.get(),
			// Translated items (distinct news items with English translation)
			db
				.select({ count: sql<number>`count(DISTINCT item_id)` })
				.from(translations)
				.where(
					and(eq(translations.itemType, "news"), eq(translations.language, "en")),
				)
				.get(),
			// Count by category
			db
				.select({
					category: newsItems.category,
					count: sql<number>`count(*)`,
				})
				.from(newsItems)
				.groupBy(newsItems.category)
				.all(),
		]);

	// Count items pending recheck (in-memory calculation)
	const itemsWithFetchedBody = await db
		.select({
			publishedAt: newsItems.publishedAt,
			bodyFetchedAt: newsItems.bodyFetchedAt,
		})
		.from(newsItems)
		.where(isNotNull(newsItems.bodyFetchedAt))
		.all();

	const itemsPendingRecheck = itemsWithFetchedBody.filter((item) =>
		isDueForCheck(item.publishedAt, item.bodyFetchedAt),
	).length;

	const byCategory: Record<string, number> = {};
	for (const row of categoryResults) {
		byCategory[row.category] = row.count;
	}

	return {
		totalItems: totalResult?.count ?? 0,
		itemsWithBody: withBodyResult?.count ?? 0,
		itemsTranslated: translatedResult?.count ?? 0,
		itemsPendingRecheck,
		byCategory,
	};
}

/**
 * Get items due for body recheck, sorted by next check time.
 */
export async function getRecheckQueue(
	db: Database,
	limit: number = 50,
): Promise<
	Array<{
		id: string;
		titleJa: string;
		category: string;
		publishedAt: number;
		bodyFetchedAt: number;
		nextCheckAt: number;
	}>
> {
	const items = await db
		.select()
		.from(newsItems)
		.where(isNotNull(newsItems.bodyFetchedAt))
		.all();

	return items
		.map((item) => ({
			id: item.id,
			titleJa: item.titleJa,
			category: item.category,
			publishedAt: item.publishedAt,
			bodyFetchedAt: item.bodyFetchedAt!,
			nextCheckAt: getNextCheckTime(item.publishedAt, item.bodyFetchedAt!),
		}))
		.filter((item) => item.nextCheckAt <= Date.now())
		.sort((a, b) => a.nextCheckAt - b.nextCheckAt)
		.slice(0, limit);
}

/**
 * Invalidate cached body content for a news item.
 */
export async function invalidateBody(
	db: Database,
	id: string,
): Promise<boolean> {
	const result = await db
		.update(newsItems)
		.set({
			contentJa: null,
			sourceUpdatedAt: null,
			bodyFetchedAt: null,
			bodyFetchingSince: null,
		})
		.where(eq(newsItems.id, id))
		.returning({ id: newsItems.id });

	return result.length > 0;
}

/**
 * Delete a translation for a news item.
 */
export async function deleteTranslation(
	db: Database,
	itemId: string,
	language: string,
): Promise<boolean> {
	const result = await db
		.delete(translations)
		.where(
			and(
				eq(translations.itemType, "news"),
				eq(translations.itemId, itemId),
				eq(translations.language, language),
			),
		)
		.returning({ itemId: translations.itemId });

	return result.length > 0;
}
