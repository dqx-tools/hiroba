import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
	const response = await next();

	// Cache SSR pages for 5 minutes, stale-while-revalidate for 1 hour
	const pathname = context.url.pathname;
	if (
		pathname.startsWith("/news/") ||
		pathname.startsWith("/category/") ||
		pathname === "/"
	) {
		response.headers.set(
			"Cache-Control",
			"public, max-age=300, stale-while-revalidate=3600",
		);
	}

	return response;
});
