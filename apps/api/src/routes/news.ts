/**
 * Public news API routes.
 *
 * GET /api/news - List news items with pagination and filtering
 * GET /api/news/:id - Get single news item (with lazy body fetch)
 * GET /api/news/:id/:lang - Get translated news item
 */

import { Hono } from "hono";
import type { Database } from "@hiroba/db";
import type { Category } from "@hiroba/shared";
import { getNewsItems, getNewsItem } from "../lib/news-repository";
import { getNewsBodyWithFetch } from "../lib/body-fetcher";
import { getOrCreateTranslation } from "../lib/ai-translator";

type Bindings = {
	OPENAI_API_KEY: string;
};

type Variables = {
	db: Database;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /api/news - List news items (metadata only)
 *
 * Query params:
 * - category: Filter by category (news|event|update|maintenance)
 * - limit: Number of items (default 20, max 100)
 * - cursor: Pagination cursor (publishedAt timestamp)
 */
app.get("/", async (c) => {
	const db = c.get("db");
	const category = c.req.query("category") as Category | undefined;
	const limitParam = c.req.query("limit");
	const cursor = c.req.query("cursor");

	const limit = Math.min(limitParam ? parseInt(limitParam, 10) : 20, 100);

	// Validate category if provided
	const validCategories = ["news", "event", "update", "maintenance"];
	if (category && !validCategories.includes(category)) {
		return c.json(
			{
				error: "Invalid category",
				valid: validCategories,
			},
			400,
		);
	}

	const result = await getNewsItems(db, { category, limit, cursor });

	return c.json(result);
});

/**
 * GET /api/news/:id - Get single news item with lazy body fetch
 */
app.get("/:id", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");

	const item = await getNewsItem(db, id);

	if (!item) {
		return c.json({ error: "Not found" }, 404);
	}

	// Lazy body fetch if not yet fetched
	if (item.contentJa === null) {
		try {
			const body = await getNewsBodyWithFetch(db, id);
			if (body) {
				item.contentJa = body.contentJa;
				item.sourceUpdatedAt = body.sourceUpdatedAt;
			}
		} catch (error) {
			// Body fetch failed but we can still return metadata
			console.error(`Body fetch failed for ${id}:`, error);
		}
	}

	return c.json({ item });
});

/**
 * GET /api/news/:id/:lang - Get translated news item
 *
 * Fetches body if needed, then returns translated content.
 */
app.get("/:id/:lang", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");
	const lang = c.req.param("lang");

	// Validate language
	const validLanguages = ["en"]; // Add more as supported
	if (!validLanguages.includes(lang)) {
		return c.json(
			{
				error: "Unsupported language",
				valid: validLanguages,
			},
			400,
		);
	}

	const item = await getNewsItem(db, id);

	if (!item) {
		return c.json({ error: "Not found" }, 404);
	}

	// Ensure body is fetched
	if (item.contentJa === null) {
		try {
			const body = await getNewsBodyWithFetch(db, id);
			if (body) {
				item.contentJa = body.contentJa;
				item.sourceUpdatedAt = body.sourceUpdatedAt;
			}
		} catch (error) {
			return c.json(
				{ error: `Failed to fetch content: ${error}` },
				500,
			);
		}
	}

	if (!item.contentJa) {
		return c.json({ error: "Content not available" }, 500);
	}

	// Get or create translation
	try {
		const translation = await getOrCreateTranslation(
			db,
			id,
			"news",
			lang,
			item.titleJa,
			item.contentJa,
			item.sourceUpdatedAt ?? Math.floor(Date.now() / 1000),
			c.env.OPENAI_API_KEY,
		);

		return c.json({
			item,
			translation,
		});
	} catch (error) {
		return c.json(
			{ error: `Translation failed: ${error}` },
			500,
		);
	}
});

export default app;
