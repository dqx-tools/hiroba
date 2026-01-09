/**
 * Cloudflare Workers entry point for DQX News API.
 */

import { D1Cache } from "./cache";
import { createApp } from "./api";
import { DQXNewsScraper } from "./scraper";
import { DQXTranslator, computeContentHash } from "./translator";
import { fetchGlossary } from "./glossary";
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

		// Create Hono app and handle request
		const app = createApp(cache, translator);
		return app.fetch(request, env);
	},

	/**
	 * Handle scheduled cron jobs.
	 */
	async scheduled(
		controller: ScheduledController,
		env: Env,
		_ctx: ExecutionContext
	): Promise<void> {
		const cache = new D1Cache(env.DB);

		// Check which cron triggered (by schedule pattern)
		// "0 15 * * *" = glossary refresh (daily at midnight JST)
		// "0 * * * *" = news refresh (hourly)
		const isGlossaryRefresh = controller.cron === "0 15 * * *";

		if (isGlossaryRefresh) {
			await this.refreshGlossary(cache);
		} else {
			await this.refreshNews(cache, env);
		}
	},

	/**
	 * Refresh the glossary from GitHub.
	 */
	async refreshGlossary(cache: D1Cache): Promise<void> {
		try {
			const entries = await fetchGlossary();
			const count = await cache.updateGlossary(entries);
			console.log(`Glossary refresh complete: ${count} entries loaded`);
		} catch (error) {
			console.error("Glossary refresh failed:", error);
		}
	},

	/**
	 * Refresh news listings from all categories.
	 */
	async refreshNews(cache: D1Cache, env: Env): Promise<void> {
		const translator = new DQXTranslator(
			env.OPENAI_API_KEY,
			env.OPENAI_MODEL || "gpt-4.5-preview"
		);

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

						// Find matching glossary entries for the title
						const glossaryEntries =
							await cache.findMatchingGlossaryEntries(item.title);

						// Translate title only for listing
						const translated = await translator.translateNewsItem(
							item,
							glossaryEntries
						);

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
