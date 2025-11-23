/**
 * Cloudflare Workers entry point for DQX News API.
 */

import { D1Cache } from "./cache";
import { createApp } from "./api";
import { DQXNewsScraper } from "./scraper";
import { DQXTranslator, computeContentHash } from "./translator";
import { NewsCategory, type Env } from "./types";

export default {
	/**
	 * Handle HTTP fetch requests.
	 */
	async fetch(
		request: Request,
		env: Env,
		_ctx: ExecutionContext
	): Promise<Response> {
		const cache = new D1Cache(env.DB);
		const translator = new DQXTranslator(
			env.OPENAI_API_KEY,
			env.OPENAI_MODEL || "gpt-5.1"
		);

		// Initialize cache schema
		await cache.initialize();

		// Create Hono app and handle request
		const app = createApp(cache, translator);
		return app.fetch(request, env);
	},

	/**
	 * Handle scheduled cron jobs.
	 */
	async scheduled(
		_controller: ScheduledController,
		env: Env,
		_ctx: ExecutionContext
	): Promise<void> {
		const cache = new D1Cache(env.DB);
		const translator = new DQXTranslator(
			env.OPENAI_API_KEY,
			env.OPENAI_MODEL || "gpt-4.5-preview"
		);

		// Initialize cache schema if needed
		await cache.initialize();

		// Refresh all categories
		let refreshed = 0;
		let errors = 0;

		const scraper = new DQXNewsScraper();
		const categories = [
			NewsCategory.NEWS,
			NewsCategory.EVENTS,
			NewsCategory.UPDATES,
			NewsCategory.MAINTENANCE,
		];

		for (const category of categories) {
			try {
				const { items } = await scraper.getNewsListing(category, 1);

				for (const item of items.slice(0, 50)) {
					try {
						// Check if already cached with same title
						const cached = await cache.getTranslation(item.id);
						if (cached && cached.title_ja === item.title) {
							continue;
						}

						// Translate title only for listing
						const translated =
							await translator.translateNewsItem(item);

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

		console.log(
			`Scheduled refresh complete: ${refreshed} items refreshed, ${errors} errors`
		);
	},
};
