/**
 * Type definitions for DQX News API.
 */

/**
 * DQX news categories.
 */
export enum NewsCategory {
	NEWS = 0,
	EVENTS = 1,
	UPDATES = 2,
	MAINTENANCE = 3,
}

export const CATEGORY_JAPANESE_NAMES: Record<NewsCategory, string> = {
	[NewsCategory.NEWS]: "ニュース",
	[NewsCategory.EVENTS]: "イベント",
	[NewsCategory.UPDATES]: "アップデート",
	[NewsCategory.MAINTENANCE]: "メンテナンス/障害",
};

export const CATEGORY_ENGLISH_NAMES: Record<NewsCategory, string> = {
	[NewsCategory.NEWS]: "News",
	[NewsCategory.EVENTS]: "Events",
	[NewsCategory.UPDATES]: "Updates",
	[NewsCategory.MAINTENANCE]: "Maintenance",
};

/**
 * A news item from the listing page.
 */
export interface NewsItem {
	id: string;
	title: string;
	date: string;
	url: string;
	category: NewsCategory;
}

/**
 * Full news article content.
 */
export interface NewsDetail {
	id: string;
	title: string;
	date: string;
	category: NewsCategory;
	contentHtml: string;
	contentText: string;
	url: string;
}

/**
 * Translated news item.
 */
export interface TranslatedNewsItem {
	id: string;
	titleJa: string;
	titleEn: string;
	date: string;
	url: string;
	category: string;
	categoryJa: string;
}

/**
 * Translated full news article.
 */
export interface TranslatedNewsDetail {
	id: string;
	titleJa: string;
	titleEn: string;
	date: string;
	url: string;
	category: string;
	categoryJa: string;
	contentJa: string;
	contentEn: string;
	contentHash: string;
}

/**
 * Cached translation record from D1 database.
 */
export interface CachedTranslation {
	news_id: string;
	content_hash: string;
	title_ja: string;
	title_en: string;
	content_ja: string | null;
	content_en: string | null;
	category: string;
	date: string;
	url: string;
	created_at: string;
	updated_at: string;
}

/**
 * API response model for news list item.
 */
export interface NewsListItemResponse {
	id: string;
	title_ja: string;
	title_en: string;
	date: string;
	url: string;
	category: string;
	category_ja: string;
}

/**
 * API response model for news listing.
 */
export interface NewsListResponse {
	items: NewsListItemResponse[];
	total: number;
	page: number;
	page_size: number;
	has_more: boolean;
}

/**
 * API response model for news detail.
 */
export interface NewsDetailResponse {
	id: string;
	title_ja: string;
	title_en: string;
	date: string;
	url: string;
	category: string;
	category_ja: string;
	content_ja: string;
	content_en: string;
	cached: boolean;
}

/**
 * API response for refresh operation.
 */
export interface RefreshResponse {
	refreshed: number;
	errors: number;
	message: string;
}

/**
 * Cloudflare Worker environment bindings.
 */
export interface Env {
	DB: D1Database;
	OPENAI_API_KEY: string;
	OPENAI_MODEL?: string;
}

/**
 * Category info for API response.
 */
export interface CategoryInfo {
	id: number;
	name: string;
	name_ja: string;
}

/**
 * Glossary entry for translation assistance.
 */
export interface GlossaryEntry {
	id?: number;
	japanese_text: string;
	english_text: string;
	updated_at?: string;
}
