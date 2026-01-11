/**
 * Shared TypeScript types for the Hiroba news translation system.
 *
 * All timestamps are Unix timestamps in seconds unless otherwise noted.
 */

import type { Category } from "./constants";

// ============ Core Data Types ============

/**
 * List scraper output (Phase 1 scraping).
 * Contains only metadata available from list pages.
 */
export interface ListItem {
	id: string;
	titleJa: string;
	category: Category;
	publishedAt: number;
}

/**
 * Full news item from database.
 * Includes both Phase 1 (list) and Phase 2 (body) data.
 */
export interface NewsItem {
	id: string;
	titleJa: string;
	category: Category;
	publishedAt: number;
	contentJa: string | null;
	bodyFetchedAt: number | null;
}

/**
 * Translation record.
 * Supports multiple content types and languages.
 */
export interface Translation {
	itemType: "news" | "topic";
	itemId: string;
	language: string;
	title: string;
	content: string;
	translatedAt: number;
}

/**
 * Glossary entry for consistent term translation.
 */
export interface GlossaryEntry {
	sourceText: string;
	targetLanguage: string;
	translatedText: string;
	updatedAt: number;
}

// ============ API Response Types ============

/**
 * Response for news list endpoint.
 */
export interface NewsListResponse {
	items: NewsItem[];
	hasMore: boolean;
	nextCursor?: string;
}

/**
 * Response for news detail endpoint.
 */
export interface NewsDetailResponse {
	item: NewsItem;
	translation?: Translation;
}

// ============ Admin Types ============

/**
 * Response for admin stats endpoint.
 */
export interface StatsResponse {
	totalItems: number;
	itemsWithBody: number;
	itemsTranslated: number;
	itemsPendingRecheck: number;
}

/**
 * Item in the recheck queue.
 */
export interface RecheckQueueItem {
	id: string;
	titleJa: string;
	category: Category;
	publishedAt: number;
	bodyFetchedAt: number | null;
	nextCheckAt: number;
}

// ============ Scraper Types ============

/**
 * Options for list scraping.
 */
export interface ScrapeOptions {
	/** If true, scrape all pages. If false, stop when hitting known items. */
	fullScrape?: boolean;
}

/**
 * Result from body scraping.
 */
export interface BodyContent {
	contentJa: string;
}
