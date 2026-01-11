/**
 * GET /api/news/:id - Get single news item with lazy body fetch
 */

import type { APIRoute } from "astro";
import { createDb } from "@hiroba/db";
import { getNewsItem, getNewsBodyWithFetch } from "@hiroba/news-service";

export const GET: APIRoute = async ({ locals, params }) => {
	const runtime = locals.runtime;
	const db = createDb(runtime.env.DB);
	const id = params.id!;

	const item = await getNewsItem(db, id);

	if (!item) {
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		});
	}

	// Lazy body fetch if not yet fetched
	if (item.contentJa === null) {
		try {
			const body = await getNewsBodyWithFetch(db, id);
			if (body) {
				item.contentJa = body.contentJa;
			}
		} catch (error) {
			// Body fetch failed but we can still return metadata
			console.error(`Body fetch failed for ${id}:`, error);
		}
	}

	return new Response(JSON.stringify({ item }), {
		headers: { "Content-Type": "application/json" },
	});
};
