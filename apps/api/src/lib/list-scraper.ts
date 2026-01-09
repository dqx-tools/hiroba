/**
 * Async iterator-based list scraper for DQX Hiroba news.
 *
 * Yields news items page by page, allowing callers to break early
 * when hitting known items (incremental scraping mode).
 */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import {
	CATEGORIES,
	SCRAPE_CONFIG,
	type Category,
	type ListItem,
} from "@hiroba/shared";

const BASE_URL = SCRAPE_CONFIG.baseUrl;

/**
 * Map Category strings to numeric IDs used in the website URLs.
 */
const CATEGORY_TO_ID: Record<Category, number> = {
	news: 0,
	event: 1,
	update: 2,
	maintenance: 3,
};

export interface ScrapeOptions {
	/** If true, scrape all pages. If false, caller can break early. */
	fullScrape?: boolean;
}

/**
 * Parse a date string as JST and return Unix timestamp in seconds.
 * Input formats: "2024/01/15", "2024-01-15", "2024/01/15 10:30"
 */
function parseJstDateToUnix(dateStr: string): number {
	if (!dateStr) return Math.floor(Date.now() / 1000);

	// Normalize separators
	const normalized = dateStr.replace(/\//g, "-").trim();

	// Try parsing with time: "2024-01-15 10:30"
	let match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
	if (match) {
		const [, year, month, day, hour, minute] = match;
		// Create date in JST (UTC+9) and convert to Unix timestamp
		const isoStr = `${year}-${month}-${day}T${hour}:${minute}:00+09:00`;
		return Math.floor(new Date(isoStr).getTime() / 1000);
	}

	// Try parsing date only: "2024-01-15"
	match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (match) {
		const [, year, month, day] = match;
		const isoStr = `${year}-${month}-${day}T00:00:00+09:00`;
		return Math.floor(new Date(isoStr).getTime() / 1000);
	}

	// Fallback to current time
	return Math.floor(Date.now() / 1000);
}

/**
 * Extract date from near an element (sibling or parent text).
 */
function extractDateNearElement(
	$: cheerio.CheerioAPI,
	element: cheerio.Cheerio<AnyNode>,
): string {
	// Look for date pattern in parent's text
	const parent = element.parent();
	if (parent.length) {
		const text = parent.text();
		const match = text.match(/(\d{4}[-/]\d{2}[-/]\d{2}(?:\s+\d{2}:\d{2})?)/);
		if (match) return match[1];
	}

	// Look in siblings
	const siblings = element.nextAll().slice(0, 3);
	for (let i = 0; i < siblings.length; i++) {
		const text = $(siblings[i]).text();
		const match = text.match(/(\d{4}[-/]\d{2}[-/]\d{2}(?:\s+\d{2}:\d{2})?)/);
		if (match) return match[1];
	}

	return "";
}

/**
 * Extract total number of pages from pagination links.
 */
function extractTotalPages($: cheerio.CheerioAPI): number {
	let maxPage = 1;

	// Look for pagination links
	$("a[href*='/sc/news/category/']").each((_, elem) => {
		const href = $(elem).attr("href") || "";
		const match = href.match(/\/sc\/news\/category\/\d+\/(\d+)/);
		if (match) {
			const pageNum = parseInt(match[1]);
			maxPage = Math.max(maxPage, pageNum);
		}
	});

	// Also check for "last" link text
	$("a").each((_, elem) => {
		const text = $(elem).text();
		if (/last|最後/.test(text)) {
			const href = $(elem).attr("href") || "";
			const match = href.match(/\/(\d+)\/?$/);
			if (match) {
				maxPage = Math.max(maxPage, parseInt(match[1]));
			}
		}
	});

	return maxPage;
}

/**
 * Parse a list page HTML and extract news items.
 */
function parseListPage(html: string, category: Category): ListItem[] {
	const $ = cheerio.load(html);
	const items: ListItem[] = [];
	const seenIds = new Set<string>();

	// Find all news links
	$("a[href*='/sc/news/detail/']").each((_, elem) => {
		const link = $(elem);
		const href = link.attr("href") || "";
		const match = href.match(/\/sc\/news\/detail\/([^/]+)\/?/);
		if (!match) return;

		const newsId = match[1];

		// Skip duplicates
		if (seenIds.has(newsId)) return;
		seenIds.add(newsId);

		const title = link.text().trim();

		// Skip empty titles or navigation links
		if (!title || title === "詳細" || title === "もっと見る") return;

		const dateStr = extractDateNearElement($, link);

		items.push({
			id: newsId,
			titleJa: title,
			category,
			publishedAt: parseJstDateToUnix(dateStr),
		});
	});

	return items;
}

/**
 * Fetch a single list page for a category.
 */
async function fetchListPage(
	category: Category,
	page: number,
): Promise<{ items: ListItem[]; totalPages: number }> {
	const categoryId = CATEGORY_TO_ID[category];
	let url = `${BASE_URL}/sc/news/category/${categoryId}`;
	if (page > 1) {
		url += `/${page}`;
	}

	const response = await fetch(url, {
		headers: {
			"User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch list page: ${response.status}`);
	}

	const html = await response.text();
	const $ = cheerio.load(html);

	return {
		items: parseListPage(html, category),
		totalPages: extractTotalPages($),
	};
}

/**
 * Async iterator that yields news items page by page.
 * Caller can break early when hitting known items (incremental mode).
 */
export async function* scrapeNewsList(
	category: Category,
	_options: ScrapeOptions = {},
): AsyncGenerator<ListItem[], void, unknown> {
	let page = 1;
	let totalPages = 1;

	while (page <= totalPages) {
		const result = await fetchListPage(category, page);

		if (result.items.length === 0) break;

		totalPages = result.totalPages;
		yield result.items;

		page++;
	}
}

/**
 * Scrape a single category and return all items.
 * Convenience function for full scrapes.
 */
export async function scrapeCategory(category: Category): Promise<ListItem[]> {
	const allItems: ListItem[] = [];

	for await (const items of scrapeNewsList(category, { fullScrape: true })) {
		allItems.push(...items);
	}

	return allItems;
}

/**
 * Get all available categories.
 */
export function getAllCategories(): readonly Category[] {
	return CATEGORIES;
}
