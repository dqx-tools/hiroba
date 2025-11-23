/**
 * Hono API for DQX Banner Translation.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { BannerTranslator } from "./pipeline";
import { getBannerSlides } from "./slides";

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all routes
app.use("/*", cors());

/**
 * Root endpoint - API info.
 */
app.get("/", (c) => {
	return c.json({
		service: "DQX Banner Translation API",
		version: "1.0.0",
		endpoints: {
			"/": "API information",
			"/health": "Health check",
			"/slides": "Get current banner slides",
			"/translate": "Translate a single banner image (POST with {url: string})",
			"/translate/all": "Translate all current banners",
		},
	});
});

/**
 * Health check endpoint.
 */
app.get("/health", (c) => {
	return c.json({
		status: "healthy",
		service: "dqx-banner-api",
	});
});

/**
 * Get current banner slides.
 */
app.get("/slides", async (c) => {
	try {
		const slides = await getBannerSlides();
		return c.json({
			slides,
			count: slides.length,
		});
	} catch (error) {
		console.error("Error fetching slides:", error);
		return c.json(
			{
				error: "Failed to fetch banner slides",
				message: error instanceof Error ? error.message : String(error),
			},
			500
		);
	}
});

/**
 * Translate a single banner image.
 */
app.post("/translate", async (c) => {
	try {
		const body = await c.req.json<{ url: string }>();

		if (!body.url) {
			return c.json({ error: "Missing 'url' in request body" }, 400);
		}

		const translator = new BannerTranslator(c.env);
		const svg = await translator.translateImageUrl(body.url);

		return c.json({
			url: body.url,
			svg,
		});
	} catch (error) {
		console.error("Error translating banner:", error);
		return c.json(
			{
				error: "Failed to translate banner",
				message: error instanceof Error ? error.message : String(error),
			},
			500
		);
	}
});

/**
 * Translate a single banner and return SVG directly.
 */
app.post("/translate/svg", async (c) => {
	try {
		const body = await c.req.json<{ url: string }>();

		if (!body.url) {
			return c.json({ error: "Missing 'url' in request body" }, 400);
		}

		const translator = new BannerTranslator(c.env);
		const svg = await translator.translateImageUrl(body.url);

		return c.body(svg, 200, {
			"Content-Type": "image/svg+xml",
		});
	} catch (error) {
		console.error("Error translating banner:", error);
		return c.json(
			{
				error: "Failed to translate banner",
				message: error instanceof Error ? error.message : String(error),
			},
			500
		);
	}
});

/**
 * Translate all current banners.
 */
app.get("/translate/all", async (c) => {
	try {
		const translator = new BannerTranslator(c.env);
		const results = await translator.translateAllBanners();

		return c.json({
			banners: results.map(({ slide, svg }) => ({
				slide,
				svg,
			})),
			count: results.length,
		});
	} catch (error) {
		console.error("Error translating banners:", error);
		return c.json(
			{
				error: "Failed to translate banners",
				message: error instanceof Error ? error.message : String(error),
			},
			500
		);
	}
});

/**
 * 404 handler.
 */
app.notFound((c) => {
	return c.json({ error: "Not found" }, 404);
});

/**
 * Error handler.
 */
app.onError((err, c) => {
	console.error("Unhandled error:", err);
	return c.json(
		{
			error: "Internal server error",
			message: err.message,
		},
		500
	);
});

export default app;
