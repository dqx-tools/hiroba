/**
 * High-level function for fetching a news item with translation.
 *
 * Combines body fetching and translation into a single call.
 */

import type { Database, NewsItem } from "@hiroba/db";
import { getNewsItem } from "./news-repository";
import { getNewsBodyWithFetch } from "./body-fetcher";
import { getOrCreateTranslation, type TranslationResult } from "./ai-translator";

export interface NewsDetailResult {
	item: NewsItem;
	translation: TranslationResult;
}

export type NewsDetailError =
	| { type: "not_found" }
	| { type: "body_fetch_failed"; error: unknown }
	| { type: "content_unavailable" }
	| { type: "translation_failed"; error: unknown };

/**
 * Get a news item with its translation, fetching body and translating if needed.
 */
export async function getNewsItemWithTranslation(
	db: Database,
	id: string,
	lang: string,
	aiApiKey: string,
): Promise<
	| { success: true; data: NewsDetailResult }
	| { success: false; error: NewsDetailError }
> {
	const item = await getNewsItem(db, id);

	if (!item) {
		return { success: false, error: { type: "not_found" } };
	}

	// Ensure body is fetched
	if (item.contentJa === null) {
		try {
			const body = await getNewsBodyWithFetch(db, id);
			if (body) {
				item.contentJa = body.contentJa;
			}
		} catch (error) {
			return { success: false, error: { type: "body_fetch_failed", error } };
		}
	}

	if (!item.contentJa) {
		return { success: false, error: { type: "content_unavailable" } };
	}

	// Get or create translation
	try {
		const translation = await getOrCreateTranslation(
			db,
			id,
			"news",
			lang,
			item.titleJa,
			item.contentJa,
			item.publishedAt,
			aiApiKey,
		);

		return { success: true, data: { item, translation } };
	} catch (error) {
		return { success: false, error: { type: "translation_failed", error } };
	}
}
