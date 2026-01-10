/**
 * Database operations for admin API routes.
 * These mirror the repository functions from the main API.
 */

import { eq, desc, and, sql, isNotNull } from "drizzle-orm";
import { newsItems, translations, glossary, type Database } from "@hiroba/db";
import { isDueForCheck, getNextCheckTime, type Category, CATEGORIES } from "@hiroba/shared";
import { scrapeNewsList } from "./scraper";

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
			db.select({ count: sql<number>`count(*)` }).from(newsItems).get(),
			db
				.select({ count: sql<number>`count(*)` })
				.from(newsItems)
				.where(isNotNull(newsItems.contentJa))
				.get(),
			db
				.select({ count: sql<number>`count(DISTINCT item_id)` })
				.from(translations)
				.where(
					and(eq(translations.itemType, "news"), eq(translations.language, "en")),
				)
				.get(),
			db
				.select({
					category: newsItems.category,
					count: sql<number>`count(*)`,
				})
				.from(newsItems)
				.groupBy(newsItems.category)
				.all(),
		]);

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

/**
 * Upsert news items from list scraping.
 */
export async function upsertListItems(
	db: Database,
	items: Array<{ id: string; titleJa: string; category: string; publishedAt: number }>,
): Promise<Array<{ id: string }>> {
	const now = Math.floor(Date.now() / 1000);
	const newlyInserted: Array<{ id: string }> = [];

	for (const item of items) {
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

		if (!existing) {
			newlyInserted.push({ id: item.id });
		}
	}

	return newlyInserted;
}

/**
 * Trigger a scrape for all categories.
 */
export async function triggerScrape(
	db: Database,
	options: { full?: boolean; category?: Category },
): Promise<{
	results: Array<{ category: Category; newItems: number; totalScraped: number }>;
	totalNewItems: number;
	totalScraped: number;
}> {
	const categoriesToScrape = options.category ? [options.category] : CATEGORIES;
	const results: Array<{ category: Category; newItems: number; totalScraped: number }> = [];

	for (const category of categoriesToScrape) {
		let newItems = 0;
		let totalScraped = 0;

		for await (const items of scrapeNewsList(category)) {
			totalScraped += items.length;
			const inserted = await upsertListItems(db, items);
			newItems += inserted.length;

			if (!options.full && inserted.length < items.length * 0.5) {
				break;
			}
		}

		results.push({ category, newItems, totalScraped });
	}

	return {
		results,
		totalNewItems: results.reduce((sum, r) => sum + r.newItems, 0),
		totalScraped: results.reduce((sum, r) => sum + r.totalScraped, 0),
	};
}

/**
 * Get all glossary entries.
 */
export async function getGlossaryEntries(
	db: Database,
	lang?: string,
): Promise<Array<{
	sourceText: string;
	targetLanguage: string;
	translatedText: string;
	updatedAt: number;
}>> {
	const query = db.select().from(glossary).$dynamic();

	return lang
		? await query.where(eq(glossary.targetLanguage, lang)).all()
		: await query.all();
}

/**
 * Import glossary from CSV content.
 */
export async function importGlossaryFromCsv(
	db: Database,
	csvContent: string,
	targetLanguage: string,
): Promise<number> {
	const lines = csvContent.split("\n").filter((line) => line.trim());
	const now = Math.floor(Date.now() / 1000);

	let imported = 0;
	for (const line of lines) {
		const [sourceText, translatedText] = line.split(",").map((s) => s.trim());
		if (!sourceText || !translatedText) continue;

		await db
			.insert(glossary)
			.values({
				sourceText,
				targetLanguage,
				translatedText,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [glossary.sourceText, glossary.targetLanguage],
				set: {
					translatedText,
					updatedAt: now,
				},
			});

		imported++;
	}

	return imported;
}

/**
 * Import glossary from GitHub.
 */
export async function importGlossaryFromGitHub(
	db: Database,
): Promise<{ imported: number; source: string }> {
	const GLOSSARY_URL =
		"https://raw.githubusercontent.com/dqx-translation-project/dqx-custom-translations/main/csv/glossary.csv";

	const response = await fetch(GLOSSARY_URL);
	if (!response.ok) {
		throw new Error(`Failed to fetch glossary: ${response.status}`);
	}

	const csv = await response.text();
	const lines = csv.split("\n").filter((line) => line.trim());
	const now = Math.floor(Date.now() / 1000);

	// Clear existing glossary
	await db.delete(glossary);

	// Insert in batches
	const BATCH_SIZE = 25;
	let imported = 0;

	for (let i = 0; i < lines.length; i += BATCH_SIZE) {
		const batch = lines.slice(i, i + BATCH_SIZE);
		const entries = batch
			.map((line) => {
				const [japanese, english] = line.split(",").map((s) => s.trim());
				if (!japanese || !english) return null;
				return {
					sourceText: japanese,
					targetLanguage: "en",
					translatedText: english,
					updatedAt: now,
				};
			})
			.filter((e): e is NonNullable<typeof e> => e !== null);

		if (entries.length > 0) {
			await db
				.insert(glossary)
				.values(entries)
				.onConflictDoUpdate({
					target: [glossary.sourceText, glossary.targetLanguage],
					set: {
						translatedText: sql`excluded.translated_text`,
						updatedAt: sql`excluded.updated_at`,
					},
				});

			imported += entries.length;
		}
	}

	return { imported, source: GLOSSARY_URL };
}

/**
 * Delete a glossary entry.
 */
export async function deleteGlossaryEntry(
	db: Database,
	sourceText: string,
	targetLanguage: string,
): Promise<boolean> {
	const result = await db
		.delete(glossary)
		.where(
			and(eq(glossary.sourceText, sourceText), eq(glossary.targetLanguage, targetLanguage)),
		)
		.returning({ sourceText: glossary.sourceText });

	return result.length > 0;
}
