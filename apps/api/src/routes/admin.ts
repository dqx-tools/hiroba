/**
 * Admin API routes (protected by API key).
 *
 * POST /api/admin/scrape - Trigger list scraping
 * GET /api/admin/stats - Get database statistics
 */

import { Hono } from "hono";
import type { Database } from "@hiroba/db";
import { CATEGORIES, type Category } from "@hiroba/shared";
import { scrapeNewsList } from "../lib/list-scraper";
import { upsertListItems, getStats } from "../lib/news-repository";

type Bindings = {
	ADMIN_API_KEY: string;
};

type Variables = {
	db: Database;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Admin authentication middleware.
 * Requires Bearer token matching ADMIN_API_KEY.
 */
app.use("*", async (c, next) => {
	const authHeader = c.req.header("Authorization");
	const expectedKey = c.env.ADMIN_API_KEY;

	if (!expectedKey) {
		return c.json({ error: "Admin API not configured" }, 500);
	}

	if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	await next();
});

/**
 * POST /api/admin/scrape - Trigger list scraping
 *
 * Query params:
 * - full: If "true", scrape all pages. Otherwise incremental (stop at known items).
 * - category: Optional single category to scrape
 */
app.post("/scrape", async (c) => {
	const db = c.get("db");
	const fullScrape = c.req.query("full") === "true";
	const singleCategory = c.req.query("category") as Category | undefined;

	const categoriesToScrape = singleCategory ? [singleCategory] : CATEGORIES;
	const results: { category: Category; newItems: number; totalScraped: number }[] = [];

	for (const category of categoriesToScrape) {
		let newItems = 0;
		let totalScraped = 0;

		for await (const items of scrapeNewsList(category, { fullScrape })) {
			totalScraped += items.length;
			const inserted = await upsertListItems(db, items);
			newItems += inserted.length;

			// In incremental mode, stop when we hit mostly known items
			if (!fullScrape && inserted.length < items.length * 0.5) {
				break;
			}
		}

		results.push({ category, newItems, totalScraped });
	}

	return c.json({
		success: true,
		results,
		totalNewItems: results.reduce((sum, r) => sum + r.newItems, 0),
		totalScraped: results.reduce((sum, r) => sum + r.totalScraped, 0),
	});
});

/**
 * GET /api/admin/stats - Get database statistics
 */
app.get("/stats", async (c) => {
	const db = c.get("db");
	const stats = await getStats(db);

	return c.json(stats);
});

export default app;
