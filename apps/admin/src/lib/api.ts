/**
 * Admin API client for interacting with the Hiroba API.
 */

const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:8787";

function getApiKey(): string {
	// In production, this would come from Cloudflare Access headers
	// or be injected at build time
	if (typeof localStorage !== "undefined") {
		return localStorage.getItem("admin_api_key") || "";
	}
	return "";
}

async function adminFetch(path: string, options: RequestInit = {}) {
	const res = await fetch(`${API_URL}${path}`, {
		...options,
		headers: {
			...options.headers,
			Authorization: `Bearer ${getApiKey()}`,
		},
	});

	if (!res.ok) {
		throw new Error(`API error: ${res.status}`);
	}

	return res.json();
}

export interface Stats {
	totalItems: number;
	itemsWithBody: number;
	itemsTranslated: number;
	itemsPendingRecheck: number;
	byCategory: Record<string, number>;
}

export async function getStats(): Promise<Stats> {
	return adminFetch("/api/admin/stats");
}

export interface QueueItem {
	id: string;
	titleJa: string;
	category: string;
	publishedAt: number;
	bodyFetchedAt: number;
	nextCheckAt: number;
}

export async function getRecheckQueue(
	limit = 50,
): Promise<{ items: QueueItem[] }> {
	return adminFetch(`/api/admin/recheck-queue?limit=${limit}`);
}

export interface ScrapeResult {
	success: boolean;
	results: Array<{ category: string; newItems: number; totalScraped: number }>;
	totalNewItems: number;
	totalScraped: number;
}

export async function triggerScrape(full = false): Promise<ScrapeResult> {
	return adminFetch(`/api/admin/scrape?full=${full}`, { method: "POST" });
}

export interface NewsItem {
	id: string;
	titleJa: string;
	category: string;
	publishedAt: number;
	contentJa: string | null;
}

export async function getNewsList(options?: {
	category?: string;
	limit?: number;
}): Promise<{ items: NewsItem[]; hasMore: boolean }> {
	const params = new URLSearchParams();
	if (options?.category) params.set("category", options.category);
	if (options?.limit) params.set("limit", String(options.limit));
	const url = `${API_URL}/api/news${params.toString() ? `?${params}` : ""}`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`API error: ${res.status}`);
	return res.json();
}

export async function invalidateBody(id: string): Promise<{ success: boolean }> {
	return adminFetch(`/api/admin/news/${id}/body`, { method: "DELETE" });
}

export async function deleteTranslation(
	id: string,
	lang: string,
): Promise<{ success: boolean }> {
	return adminFetch(`/api/admin/news/${id}/${lang}`, { method: "DELETE" });
}

export interface GlossaryEntry {
	sourceText: string;
	targetLanguage: string;
	translatedText: string;
	updatedAt: number;
}

export async function getGlossary(
	lang?: string,
): Promise<{ entries: GlossaryEntry[] }> {
	const params = lang ? `?lang=${lang}` : "";
	return adminFetch(`/api/admin/glossary${params}`);
}

export async function importGlossary(
	file: File,
	targetLanguage: string,
): Promise<{ success: boolean; imported: number }> {
	const formData = new FormData();
	formData.append("file", file);
	formData.append("targetLanguage", targetLanguage);

	const res = await fetch(`${API_URL}/api/admin/glossary/import`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${getApiKey()}`,
		},
		body: formData,
	});

	if (!res.ok) throw new Error(`API error: ${res.status}`);
	return res.json();
}

export async function deleteGlossaryEntry(
	sourceText: string,
	lang: string,
): Promise<{ success: boolean }> {
	return adminFetch(
		`/api/admin/glossary/${encodeURIComponent(sourceText)}/${lang}`,
		{ method: "DELETE" },
	);
}
