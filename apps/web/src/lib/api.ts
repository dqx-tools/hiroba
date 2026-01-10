/**
 * API client for fetching news data from the Hiroba API.
 */

const API_URL = import.meta.env.API_URL || "http://localhost:8787";

export interface NewsItem {
	id: string;
	titleJa: string;
	category: string;
	publishedAt: number;
	contentJa: string | null;
}

export interface Translation {
	title: string;
	content: string;
	translatedAt: number;
}

export interface NewsListResponse {
	items: NewsItem[];
	hasMore: boolean;
	nextCursor?: string;
}

export interface NewsDetailResponse {
	item: NewsItem;
	translation?: Translation;
}

/**
 * Fetch paginated list of news items.
 */
export async function getNewsList(options?: {
	category?: string;
	limit?: number;
	cursor?: string;
}): Promise<NewsListResponse> {
	const params = new URLSearchParams();
	if (options?.category) params.set("category", options.category);
	if (options?.limit) params.set("limit", String(options.limit));
	if (options?.cursor) params.set("cursor", options.cursor);

	const url = `${API_URL}/api/news${params.toString() ? `?${params}` : ""}`;
	const res = await fetch(url);

	if (!res.ok) {
		throw new Error(`Failed to fetch news: ${res.status}`);
	}

	return res.json();
}

/**
 * Fetch a single news item with optional translation.
 */
export async function getNewsItem(
	id: string,
	lang: string = "en",
): Promise<NewsDetailResponse> {
	const res = await fetch(`${API_URL}/api/news/${id}/${lang}`);

	if (!res.ok) {
		throw new Error(`Failed to fetch news item: ${res.status}`);
	}

	return res.json();
}
