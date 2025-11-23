/**
 * Hono-based API for DQX news translations.
 */

import { Hono } from "hono";
import { D1Cache } from "./cache";
import { DQXNewsScraper } from "./scraper";
import { DQXTranslator, computeContentHash } from "./translator";
import {
	NewsCategory,
	CATEGORY_ENGLISH_NAMES,
	CATEGORY_JAPANESE_NAMES,
	type Env,
	type NewsListResponse,
	type NewsDetailResponse,
	type RefreshResponse,
	type CategoryInfo,
} from "./types";

/**
 * Get Japanese name for category.
 */
function getJapaneseCategory(category: string): string {
	const mapping: Record<string, string> = {
		News: "ニュース",
		Events: "イベント",
		Updates: "アップデート",
		Maintenance: "メンテナンス/障害",
	};
	return mapping[category] ?? category;
}

/**
 * Refresh news listings from source.
 */
async function refreshListings(
	cache: D1Cache,
	translator: DQXTranslator,
	category?: string | null,
	maxPages: number = 1
): Promise<{ refreshed: number; errors: number }> {
	let refreshed = 0;
	let errors = 0;

	// Determine categories to refresh
	let categories: NewsCategory[];
	if (category) {
		const categoryMap: Record<string, NewsCategory> = {
			news: NewsCategory.NEWS,
			events: NewsCategory.EVENTS,
			updates: NewsCategory.UPDATES,
			maintenance: NewsCategory.MAINTENANCE,
		};
		const cat = categoryMap[category.toLowerCase()];
		if (cat === undefined) {
			return { refreshed: 0, errors: 0 };
		}
		categories = [cat];
	} else {
		categories = [
			NewsCategory.NEWS,
			NewsCategory.EVENTS,
			NewsCategory.UPDATES,
			NewsCategory.MAINTENANCE,
		];
	}

	const scraper = new DQXNewsScraper();

	for (const cat of categories) {
		try {
			const { items } = await scraper.getNewsListing(cat, 1);

			for (const item of items.slice(0, 50)) {
				try {
					// Check if already cached with same title
					const cached = await cache.getTranslation(item.id);
					if (cached && cached.title_ja === item.title) {
						continue;
					}

					// Translate title only for listing
					const translated = await translator.translateNewsItem(item);

					// Save to cache (without full content)
					const contentHash = await computeContentHash(item.title);
					await cache.saveTranslation({
						newsId: translated.id,
						contentHash,
						titleJa: translated.titleJa,
						titleEn: translated.titleEn,
						category: translated.category,
						date: translated.date,
						url: translated.url,
					});
					refreshed++;
				} catch {
					errors++;
				}
			}
		} catch {
			errors++;
		}
	}

	return { refreshed, errors };
}

/**
 * Create Hono application with API routes.
 */
export function createApp(
	cache: D1Cache,
	translator: DQXTranslator
): Hono<{ Bindings: Env }> {
	const app = new Hono<{ Bindings: Env }>();

	// Root endpoint
	app.get("/", (c) => {
		return c.json({
			service: "DQX News API",
			version: "1.0.0",
			endpoints: {
				news_list: "/news",
				news_detail: "/news/{news_id}",
				categories: "/categories",
				refresh: "/refresh",
			},
		});
	});

	// Categories endpoint
	app.get("/categories", (c) => {
		const categories: CategoryInfo[] = [
			NewsCategory.NEWS,
			NewsCategory.EVENTS,
			NewsCategory.UPDATES,
			NewsCategory.MAINTENANCE,
		].map((cat) => ({
			id: cat,
			name: CATEGORY_ENGLISH_NAMES[cat],
			name_ja: CATEGORY_JAPANESE_NAMES[cat],
		}));

		return c.json({ categories });
	});

	// News listing endpoint
	app.get("/news", async (c) => {
		const categoryParam = c.req.query("category");
		const page = parseInt(c.req.query("page") || "1");
		const pageSize = Math.min(
			Math.max(parseInt(c.req.query("page_size") || "50"), 1),
			100
		);
		const refresh = c.req.query("refresh") === "true";

		const offset = (page - 1) * pageSize;

		// If refresh requested, fetch from source
		if (refresh) {
			await refreshListings(cache, translator, categoryParam);
		}

		// Get from cache
		const categoryFilter = categoryParam
			? categoryParam.charAt(0).toUpperCase() + categoryParam.slice(1).toLowerCase()
			: null;
		const cachedItems = await cache.getListings({
			category: categoryFilter,
			limit: pageSize,
			offset,
		});
		const total = await cache.getCount(categoryFilter);

		const response: NewsListResponse = {
			items: cachedItems.map((item) => ({
				id: item.news_id,
				title_ja: item.title_ja,
				title_en: item.title_en,
				date: item.date,
				url: item.url,
				category: item.category,
				category_ja: getJapaneseCategory(item.category),
			})),
			total,
			page,
			page_size: pageSize,
			has_more: offset + cachedItems.length < total,
		};

		return c.json(response);
	});

	// News detail endpoint
	app.get("/news/:news_id", async (c) => {
		const newsId = c.req.param("news_id");
		const refresh = c.req.query("refresh") === "true";

		// Check cache first
		let cached = await cache.getTranslation(newsId);

		// If another worker is translating, wait for it
		if (cached && cache.isTranslating(cached)) {
			const completed = await cache.waitForTranslation(newsId);
			if (completed) {
				cached = completed;
			} else {
				// Translation failed or timed out - we'll try ourselves
				cached = null;
			}
		}

		// Return cached if we have full content and it's fresh
		if (cached && cached.content_en && !refresh) {
			if (!cache.isCacheStale(cached)) {
				const response: NewsDetailResponse = {
					id: cached.news_id,
					title_ja: cached.title_ja,
					title_en: cached.title_en,
					date: cached.date,
					url: cached.url,
					category: cached.category,
					category_ja: getJapaneseCategory(cached.category),
					content_ja: cached.content_ja || "",
					content_en: cached.content_en,
					cached: true,
				};
				return c.json(response);
			}
		}

		// Fetch fresh content from source
		const scraper = new DQXNewsScraper();
		let detail;
		try {
			detail = await scraper.getNewsDetail(newsId);
		} catch (e) {
			// If fetch fails but we have cached content, return it
			if (cached && cached.content_en) {
				const response: NewsDetailResponse = {
					id: cached.news_id,
					title_ja: cached.title_ja,
					title_en: cached.title_en,
					date: cached.date,
					url: cached.url,
					category: cached.category,
					category_ja: getJapaneseCategory(cached.category),
					content_ja: cached.content_ja || "",
					content_en: cached.content_en,
					cached: true,
				};
				return c.json(response);
			}
			return c.json({ error: `News not found: ${e}` }, 404);
		}

		// Check if content has changed
		const contentHash = await computeContentHash(detail.contentText);
		if (cached && cached.content_en && cached.content_hash === contentHash) {
			// Content unchanged, update timestamp and return cached translation
			await cache.saveTranslation({
				newsId: cached.news_id,
				contentHash: cached.content_hash,
				titleJa: cached.title_ja,
				titleEn: cached.title_en,
				category: cached.category,
				date: cached.date,
				url: cached.url,
				contentJa: cached.content_ja,
				contentEn: cached.content_en,
			});

			const response: NewsDetailResponse = {
				id: cached.news_id,
				title_ja: cached.title_ja,
				title_en: cached.title_en,
				date: cached.date,
				url: cached.url,
				category: cached.category,
				category_ja: getJapaneseCategory(cached.category),
				content_ja: cached.content_ja || "",
				content_en: cached.content_en,
				cached: true,
			};
			return c.json(response);
		}

		// Need to translate - try to acquire lock
		const lockAcquired = await cache.tryAcquireTranslationLock(newsId);

		if (!lockAcquired) {
			// Another worker is translating - wait for it
			const completed = await cache.waitForTranslation(newsId);
			if (completed && completed.content_en) {
				const response: NewsDetailResponse = {
					id: completed.news_id,
					title_ja: completed.title_ja,
					title_en: completed.title_en,
					date: completed.date,
					url: completed.url,
					category: completed.category,
					category_ja: getJapaneseCategory(completed.category),
					content_ja: completed.content_ja || "",
					content_en: completed.content_en,
					cached: true,
				};
				return c.json(response);
			}
			// Translation failed - return error or stale cache
			if (cached && cached.content_en) {
				const response: NewsDetailResponse = {
					id: cached.news_id,
					title_ja: cached.title_ja,
					title_en: cached.title_en,
					date: cached.date,
					url: cached.url,
					category: cached.category,
					category_ja: getJapaneseCategory(cached.category),
					content_ja: cached.content_ja || "",
					content_en: cached.content_en,
					cached: true,
				};
				return c.json(response);
			}
			return c.json({ error: "Translation in progress, please retry" }, 503);
		}

		// We have the lock - translate
		try {
			const translated = await translator.translateNewsDetail(detail);

			// Save to cache (this also releases the lock by overwriting the marker)
			await cache.saveTranslation({
				newsId: translated.id,
				contentHash: translated.contentHash,
				titleJa: translated.titleJa,
				titleEn: translated.titleEn,
				category: translated.category,
				date: translated.date,
				url: translated.url,
				contentJa: translated.contentJa,
				contentEn: translated.contentEn,
			});

			const response: NewsDetailResponse = {
				id: translated.id,
				title_ja: translated.titleJa,
				title_en: translated.titleEn,
				date: translated.date,
				url: translated.url,
				category: translated.category,
				category_ja: translated.categoryJa,
				content_ja: translated.contentJa,
				content_en: translated.contentEn,
				cached: false,
			};
			return c.json(response);
		} catch (e) {
			// Translation failed - release lock
			await cache.releaseTranslationLock(newsId);
			return c.json({ error: `Translation failed: ${e}` }, 500);
		}
	});

	// Refresh endpoint
	app.post("/refresh", async (c) => {
		const categoryParam = c.req.query("category");
		const maxPages = Math.min(
			Math.max(parseInt(c.req.query("max_pages") || "1"), 1),
			10
		);

		const { refreshed, errors } = await refreshListings(
			cache,
			translator,
			categoryParam,
			maxPages
		);

		const response: RefreshResponse = {
			refreshed,
			errors,
			message: `Refreshed ${refreshed} items with ${errors} errors`,
		};
		return c.json(response);
	});

	// Health check endpoint
	app.get("/health", (c) => {
		return c.json({ status: "healthy" });
	});

	return app;
}
