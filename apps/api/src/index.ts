/**
 * Cloudflare Workers entry point for DQX News API.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb, type Database } from "@hiroba/db";
import { CATEGORIES, type Category } from "@hiroba/shared";
import { D1Cache } from "./cache";
import { fetchGlossary } from "./glossary";
import { scrapeNewsList } from "./lib/list-scraper";
import { upsertListItems } from "./lib/news-repository";

import newsRoutes from "./routes/news";
import adminRoutes from "./routes/admin";

type Bindings = {
	DB: D1Database;
	OPENAI_API_KEY: string;
	OPENAI_MODEL?: string;
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
			news_translated: "/api/news/:id/:lang",
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
	 */
	async scheduled(
		controller: ScheduledController,
		env: Bindings,
		_ctx: ExecutionContext,
	): Promise<void> {
		const cache = new D1Cache(env.DB);
		const db = createDb(env.DB);

		// "0 15 * * *" = glossary refresh (daily at midnight JST)
		// "0 * * * *" = news refresh (hourly)
		const isGlossaryRefresh = controller.cron === "0 15 * * *";

		if (isGlossaryRefresh) {
			await this.refreshGlossary(cache);
		} else {
			await this.refreshNews(db);
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

	async refreshNews(db: Database): Promise<void> {
		let totalNew = 0;
		let errors = 0;

		for (const category of CATEGORIES) {
			try {
				// Scrape first page only for scheduled refresh
				for await (const items of scrapeNewsList(category)) {
					const inserted = await upsertListItems(db, items);
					totalNew += inserted.length;
					// Only scrape first page in scheduled job
					break;
				}
			} catch (error) {
				console.error(`Failed to scrape ${category}:`, error);
				errors++;
			}
		}

		console.log(
			`Scheduled refresh complete: ${totalNew} new items, ${errors} errors`,
		);
	},
};
