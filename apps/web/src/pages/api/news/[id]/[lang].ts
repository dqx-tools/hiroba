/**
 * GET /api/news/:id/:lang - Get translated news item
 *
 * Fetches body if needed, then returns translated content.
 */

import type { APIRoute } from "astro";
import { createDb, getNewsItem, getOrCreateTranslation } from "@hiroba/db";
import { getNewsBodyWithFetch } from "@hiroba/scraper";

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

	// Get the news item
	const item = await getNewsItem(db, id);
	if (!item) {
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		});
	}

	// Fetch body if needed
	if (item.contentJa === null) {
		try {
			const body = await getNewsBodyWithFetch(db, id);
			if (body) {
				item.contentJa = body.contentJa;
			}
		} catch (error) {
			return new Response(
				JSON.stringify({ error: `Failed to fetch content: ${error}` }),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			);
		}
	}

	if (!item.contentJa) {
		return new Response(
			JSON.stringify({ error: "Content not available" }),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);
	}

	// Get or create translation
	try {
		const translations = await getOrCreateTranslation(
			db,
			id,
			"news",
			lang,
			{ title: item.titleJa, content: item.contentJa },
			item.publishedAt,
			runtime.env.OPENAI_API_KEY,
		);

		// Extract values for response (backward compatible format)
		const translation = {
			title: translations.title?.value ?? item.titleJa,
			content: translations.content?.value ?? item.contentJa,
			translatedAt: translations.title?.translatedAt ?? 0,
			model: translations.title?.model ?? null,
		};

		return new Response(JSON.stringify({ item, translation }), {
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return new Response(
			JSON.stringify({ error: `Translation failed: ${error}` }),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);
	}
};
