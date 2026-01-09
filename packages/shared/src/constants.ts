/**
 * Shared constants for the Hiroba news translation system.
 */

// News categories
export const CATEGORIES = ["news", "event", "update", "maintenance"] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Maps Japanese category names to English slugs.
 * Used when parsing scraped content.
 */
export const CATEGORY_MAP: Record<string, Category> = {
	ニュース: "news",
	イベント: "event",
	アップデート: "update",
	メンテナンス: "maintenance",
	障害: "maintenance",
};

/**
 * Human-readable labels for categories.
 * Used in UI display.
 */
export const CATEGORY_LABELS: Record<Category, string> = {
	news: "News",
	event: "Events",
	update: "Updates",
	maintenance: "Maintenance",
};

/**
 * Scraping configuration - source URLs and paths.
 */
export const SCRAPE_CONFIG = {
	baseUrl: "https://hiroba.dqx.jp",
	newsListPath: "/sc/news/",
	newsDetailPath: "/sc/news/detail/",
	topicsDetailPath: "/sc/topics/detail/",
} as const;

/**
 * Concurrency lock configuration.
 * Used to prevent duplicate fetches/translations in serverless environment.
 *
 * All time values in milliseconds unless noted.
 */
export const LOCK_CONFIG = {
	// Body fetch settings
	bodyFetchStaleThreshold: 30_000, // 30 seconds - lock considered stale
	bodyFetchMaxWait: 15_000, // 15 seconds - max time to wait for another worker
	bodyFetchPollInterval: 500, // 500ms - polling interval when waiting

	// Translation settings
	translationStaleThreshold: 60_000, // 60 seconds - lock considered stale
	translationMaxWait: 30_000, // 30 seconds - max time to wait
	translationPollInterval: 500, // 500ms - polling interval
} as const;
