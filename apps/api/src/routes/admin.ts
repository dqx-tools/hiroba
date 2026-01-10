/**
 * Admin API routes (protected by API key).
 *
 * POST /api/admin/scrape - Trigger list scraping
 * GET /api/admin/stats - Get database statistics
 * GET /api/admin/recheck-queue - Items due for body recheck
 * DELETE /api/admin/news/:id/body - Invalidate cached body
 * DELETE /api/admin/news/:id/:lang - Delete translation
 * GET /api/admin/glossary - List glossary entries
 * POST /api/admin/glossary/import - Import glossary from CSV
 * DELETE /api/admin/glossary/:sourceText/:lang - Delete glossary entry
 */

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { glossary, type Database } from "@hiroba/db";
import { CATEGORIES, type Category } from "@hiroba/shared";
import { scrapeNewsList } from "../lib/list-scraper";
import {
	upsertListItems,
	getStats,
	getRecheckQueue,
	invalidateBody,
	deleteTranslation,
} from "../lib/news-repository";

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

		for await (const items of scrapeNewsList(category)) {
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

/**
 * GET /api/admin/recheck-queue - Items due for body recheck
 */
app.get("/recheck-queue", async (c) => {
	const db = c.get("db");
	const limit = parseInt(c.req.query("limit") ?? "50", 10);

	const items = await getRecheckQueue(db, limit);

	return c.json({ items });
});

/**
 * DELETE /api/admin/news/:id/body - Invalidate cached body
 */
app.delete("/news/:id/body", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");

	const success = await invalidateBody(db, id);

	if (!success) {
		return c.json({ error: "Not found" }, 404);
	}

	return c.json({ success: true, id });
});

/**
 * DELETE /api/admin/news/:id/:lang - Delete translation
 */
app.delete("/news/:id/:lang", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");
	const lang = c.req.param("lang");

	const success = await deleteTranslation(db, id, lang);

	if (!success) {
		return c.json({ error: "Not found" }, 404);
	}

	return c.json({ success: true, id, language: lang });
});

/**
 * GET /api/admin/glossary - List glossary entries
 */
app.get("/glossary", async (c) => {
	const db = c.get("db");
	const lang = c.req.query("lang");

	const query = db.select().from(glossary).$dynamic();

	const entries = lang
		? await query.where(eq(glossary.targetLanguage, lang)).all()
		: await query.all();

	return c.json({ entries });
});

/**
 * POST /api/admin/glossary/import - Import glossary from CSV
 */
app.post("/glossary/import", async (c) => {
	const db = c.get("db");
	const formData = await c.req.formData();
	const file = formData.get("file") as File | null;
	const targetLanguage = formData.get("targetLanguage") as string | null;

	if (!file || !targetLanguage) {
		return c.json({ error: "Missing file or targetLanguage" }, 400);
	}

	const csv = await file.text();
	const lines = csv.split("\n").filter((line) => line.trim());
	const now = Math.floor(Date.now() / 1000);

	let imported = 0;
	for (const line of lines) {
		const [sourceText, translatedText] = line.split(",").map((s) => s.trim());
		if (!sourceText || !translatedText) continue;

		await db
			.insert(glossary)
			.values({
				sourceText,
				targetLanguage,
				translatedText,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [glossary.sourceText, glossary.targetLanguage],
				set: {
					translatedText,
					updatedAt: now,
				},
			});

		imported++;
	}

	return c.json({ success: true, imported });
});

/**
 * DELETE /api/admin/glossary/:sourceText/:lang - Delete glossary entry
 */
app.delete("/glossary/:sourceText/:lang", async (c) => {
	const db = c.get("db");
	const sourceText = decodeURIComponent(c.req.param("sourceText"));
	const lang = c.req.param("lang");

	const result = await db
		.delete(glossary)
		.where(
			and(eq(glossary.sourceText, sourceText), eq(glossary.targetLanguage, lang)),
		)
		.returning({ sourceText: glossary.sourceText });

	if (result.length === 0) {
		return c.json({ error: "Not found" }, 404);
	}

	return c.json({ success: true });
});

export default app;
