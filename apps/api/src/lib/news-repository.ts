/**
 * Database operations for news items using Drizzle ORM.
 *
 * Handles upserts from list scraping and queries for API endpoints.
 */

import { eq, desc, and, lt, sql } from "drizzle-orm";
import { newsItems, type Database } from "@hiroba/db";
import type { ListItem, NewsItem, Category } from "@hiroba/shared";

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
	byCategory: Record<string, number>;
}> {
	// Total count
	const totalResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(newsItems)
		.get();
	const totalItems = totalResult?.count ?? 0;

	// Items with body content
	const withBodyResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(newsItems)
		.where(sql`${newsItems.contentJa} IS NOT NULL`)
		.get();
	const itemsWithBody = withBodyResult?.count ?? 0;

	// Count by category
	const categoryResults = await db
		.select({
			category: newsItems.category,
			count: sql<number>`count(*)`,
		})
		.from(newsItems)
		.groupBy(newsItems.category)
		.all();

	const byCategory: Record<string, number> = {};
	for (const row of categoryResults) {
		byCategory[row.category] = row.count;
	}

	return { totalItems, itemsWithBody, byCategory };
}
