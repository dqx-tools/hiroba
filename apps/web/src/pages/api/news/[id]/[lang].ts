/**
 * GET /api/news/:id/:lang - Get translated news item
 *
 * Fetches body if needed, then returns translated content.
 */

import type { APIRoute } from "astro";
import { createDb } from "@hiroba/db";
import { getNewsItem, getNewsBodyWithFetch, getOrCreateTranslation } from "@hiroba/news-service";

export const GET: APIRoute = async ({ locals, params }) => {
	const runtime = locals.runtime;
	const db = createDb(runtime.env.DB);
	const id = params.id!;
	const lang = params.lang!;

	// Validate language
	const validLanguages = ["en"];
	if (!validLanguages.includes(lang)) {
		return new Response(
			JSON.stringify({
				error: "Unsupported language",
				valid: validLanguages,
			}),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const item = await getNewsItem(db, id);

	if (!item) {
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		});
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
			return new Response(
				JSON.stringify({ error: `Failed to fetch content: ${error}` }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	if (!item.contentJa) {
		return new Response(JSON.stringify({ error: "Content not available" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
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
			runtime.env.OPENAI_API_KEY,
		);

		return new Response(JSON.stringify({ item, translation }), {
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return new Response(
			JSON.stringify({ error: `Translation failed: ${error}` }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};
