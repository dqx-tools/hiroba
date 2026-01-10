/**
 * GET /api/news/:id/:lang - Get translated news item
 *
 * Fetches body if needed, then returns translated content.
 */

import type { APIRoute } from "astro";
import { createDb } from "@hiroba/db";
import { getNewsItemWithTranslation } from "@hiroba/news-service";

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

	const result = await getNewsItemWithTranslation(db, id, lang, runtime.env.OPENAI_API_KEY);

	if (!result.success) {
		const err = result.error;
		let status: number;
		let message: string;

		switch (err.type) {
			case "not_found":
				status = 404;
				message = "Not found";
				break;
			case "body_fetch_failed":
				status = 500;
				message = `Failed to fetch content: ${err.error}`;
				break;
			case "content_unavailable":
				status = 500;
				message = "Content not available";
				break;
			case "translation_failed":
				status = 500;
				message = `Translation failed: ${err.error}`;
				break;
		}

		return new Response(JSON.stringify({ error: message }), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}

	return new Response(JSON.stringify(result.data), {
		headers: { "Content-Type": "application/json" },
	});
};
