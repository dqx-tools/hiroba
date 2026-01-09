/**
 * Public news API routes.
 *
 * GET /api/news - List news items with pagination and filtering
 * GET /api/news/:id - Get single news item
 */

import { Hono } from "hono";
import type { Database } from "@hiroba/db";
import type { Category, CATEGORIES } from "@hiroba/shared";
import { getNewsItems, getNewsItem } from "../lib/news-repository";

type Variables = {
	db: Database;
};

const app = new Hono<{ Variables: Variables }>();

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

	const limit = limitParam ? parseInt(limitParam, 10) : 20;

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
 * GET /api/news/:id - Get single news item
 *
 * Note: Body fetch (lazy load) will be added in Phase 5.
 */
app.get("/:id", async (c) => {
	const db = c.get("db");
	const id = c.req.param("id");

	const item = await getNewsItem(db, id);

	if (!item) {
		return c.json({ error: "Not found" }, 404);
	}

	return c.json({ item });
});

export default app;
