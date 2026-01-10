/**
 * Cloudflare Workers entry point for DQX News API.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb, glossary, type Database } from "@hiroba/db";
import { CATEGORIES } from "@hiroba/shared";
import { fetchGlossary } from "./glossary";
import { scrapeNewsList } from "./lib/list-scraper";
import { upsertListItems } from "./lib/news-repository";
import { publishUpdate } from "./lib/pubsub";

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
			admin_scrape: "POST /api/admin/scrape",
			admin_stats: "GET /api/admin/stats",
			admin_recheck_queue: "GET /api/admin/recheck-queue",
			admin_invalidate_body: "DELETE /api/admin/news/:id/body",
			admin_delete_translation: "DELETE /api/admin/news/:id/:lang",
			admin_glossary: "GET /api/admin/glossary",
			admin_glossary_import: "POST /api/admin/glossary/import",
			admin_glossary_delete: "DELETE /api/admin/glossary/:sourceText/:lang",
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
		const db = createDb(env.DB);

		// "0 15 * * *" = glossary refresh (daily at midnight JST)
		// "0 * * * *" = news refresh (hourly)
		const isGlossaryRefresh = controller.cron === "0 15 * * *";

		if (isGlossaryRefresh) {
			await this.refreshGlossary(db);
		} else {
			await this.refreshNews(db);
		}
	},

	async refreshGlossary(db: Database): Promise<void> {
		try {
			const entries = await fetchGlossary();
			const now = Math.floor(Date.now() / 1000);

			// Clear existing glossary and insert new entries
			await db.delete(glossary);

			// Insert in batches
			const BATCH_SIZE = 100;
			let inserted = 0;

			for (let i = 0; i < entries.length; i += BATCH_SIZE) {
				const batch = entries.slice(i, i + BATCH_SIZE);

				await db.insert(glossary).values(
					batch.map((e) => ({
						sourceText: e.japanese_text,
						targetLanguage: "en",
						translatedText: e.english_text,
						updatedAt: now,
					})),
				);

				inserted += batch.length;
			}

			console.log(`Glossary refresh complete: ${inserted} entries loaded`);
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

		// Publish update event for WebSub subscribers (no-op for now)
		if (totalNew > 0) {
			await publishUpdate({
				topic: "/api/feed/news",
				contentType: "application/json",
				content: JSON.stringify({ newItems: totalNew }),
			});
		}
	},
};
