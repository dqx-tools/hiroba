/**
 * Cloudflare Workers entry point for DQX News API.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb, type Database } from "@hiroba/db";
import { D1Cache } from "./cache";
import { DQXNewsScraper } from "./scraper";
import { DQXTranslator, computeContentHash } from "./translator";
import { fetchGlossary } from "./glossary";
import { NewsCategory, type Env } from "./types";

import newsRoutes from "./routes/news";
import adminRoutes from "./routes/admin";

type Bindings = Env & {
	ADMIN_API_KEY: string;
};

type Variables = {
	db: Database;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// CORS for all routes
app.use("*", cors());

// Inject database into context
app.use("*", async (c, next) => {
	c.set("db", createDb(c.env.DB));
	await next();
});

// Root endpoint
app.get("/", (c) => {
	return c.json({
		service: "Hiroba News API",
		version: "2.0.0",
		endpoints: {
			news_list: "/api/news",
			news_detail: "/api/news/:id",
			admin_scrape: "/api/admin/scrape",
			admin_stats: "/api/admin/stats",
		},
	});
});

// Mount API routes
app.route("/api/news", newsRoutes);
app.route("/api/admin", adminRoutes);

export default {
	fetch: app.fetch,

	/**
	 * Handle scheduled cron jobs.
	 * TODO: Refactor to use new list-scraper in Phase 5/6
	 */
	async scheduled(
		controller: ScheduledController,
		env: Env,
		_ctx: ExecutionContext
	): Promise<void> {
		const cache = new D1Cache(env.DB);

		// "0 15 * * *" = glossary refresh (daily at midnight JST)
		// "0 * * * *" = news refresh (hourly)
		const isGlossaryRefresh = controller.cron === "0 15 * * *";

		if (isGlossaryRefresh) {
			await this.refreshGlossary(cache);
		} else {
			await this.refreshNews(cache, env);
		}
	},

	async refreshGlossary(cache: D1Cache): Promise<void> {
		try {
			const entries = await fetchGlossary();
			const count = await cache.updateGlossary(entries);
			console.log(`Glossary refresh complete: ${count} entries loaded`);
		} catch (error) {
			console.error("Glossary refresh failed:", error);
		}
	},

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
						const cached = await cache.getTranslation(item.id);
						if (cached && cached.title_ja === item.title) {
							continue;
						}

						const glossaryEntries =
							await cache.findMatchingGlossaryEntries(item.title);

						const translated = await translator.translateNewsItem(
							item,
							glossaryEntries
						);

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
