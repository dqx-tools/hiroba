/**
 * DQX News scraper for extracting news listings and content.
 */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import {
	NewsCategory,
	CATEGORY_ENGLISH_NAMES,
	type NewsItem,
	type NewsDetail,
} from "./types";

const BASE_URL = "https://hiroba.dqx.jp";
const NEWS_LIST_URL = "/sc/news/category/{category}";
const NEWS_DETAIL_URL = "/sc/news/detail/{news_id}/";

/**
 * Parse a date string as JST and convert to ISO8601 format.
 * Input is assumed to be in JST (Japan Standard Time, UTC+9).
 */
function parseJstDateToIso8601(dateStr: string): string {
	if (!dateStr) return "";

	// Normalize separators
	const normalized = dateStr.replace(/\//g, "-").trim();

	// Try parsing with time: "2024-01-15 10:30"
	let match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
	if (match) {
		const [, year, month, day, hour, minute] = match;
		return `${year}-${month}-${day}T${hour}:${minute}:00.000+09:00`;
	}

	// Try parsing date only: "2024-01-15"
	match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (match) {
		const [, year, month, day] = match;
		return `${year}-${month}-${day}T00:00:00.000+09:00`;
	}

	// Return original if parsing fails
	return dateStr;
}

/**
 * Extract date from near an element.
 */
function extractDateNearElement($: cheerio.CheerioAPI, element: cheerio.Cheerio<AnyNode>): string {
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
 * Extract total number of pages from pagination.
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

	// Also check for "last" link text that might contain page number
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
 * Detect news category from page content.
 */
function detectCategory($: cheerio.CheerioAPI): NewsCategory {
	// Look for category links in navigation/breadcrumbs
	for (const cat of Object.values(NewsCategory).filter(
		(v) => typeof v === "number"
	) as NewsCategory[]) {
		const link = $(`a[href*="/sc/news/category/${cat}"]`);
		if (link.length) {
			const classes = link.attr("class") || "";
			if (classes.includes("current") || classes.includes("active")) {
				return cat;
			}
		}
	}

	// Default to NEWS
	return NewsCategory.NEWS;
}

/**
 * Extract main article content.
 */
function extractContent($: cheerio.CheerioAPI): { html: string; text: string } {
	// Try to find main content area
	const selectors = [
		"div[class*='newsdetail']",
		"div[class*='article']",
		"div[class*='content']",
		"div[class*='body']",
		"article",
		"main",
	];

	let contentElem: cheerio.Cheerio<AnyNode> | null = null;
	for (const selector of selectors) {
		const found = $(selector).first();
		if (found.length) {
			contentElem = found;
			break;
		}
	}

	if (!contentElem) {
		// Fallback: get body and remove navigation elements
		contentElem = $("body");
		if (contentElem.length) {
			// Remove navigation, header, footer
			contentElem.find("nav, header, footer, script, style").remove();
		}
	}

	if (contentElem && contentElem.length) {
		return {
			html: contentElem.html() || "",
			text: contentElem.text().replace(/\s+/g, " ").trim(),
		};
	}

	return { html: "", text: "" };
}

/**
 * Scraper for DQX Hiroba news pages.
 */
export class DQXNewsScraper {
	private userAgent =
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

	/**
	 * Fetch news listing for a category.
	 */
	async getNewsListing(
		category: NewsCategory,
		page: number = 1
	): Promise<{ items: NewsItem[]; totalPages: number }> {
		let url =
			BASE_URL + NEWS_LIST_URL.replace("{category}", String(category));
		if (page > 1) {
			url += `/${page}`;
		}

		const response = await fetch(url, {
			headers: { "User-Agent": this.userAgent },
		});
		if (!response.ok) {
			throw new Error(
				`Failed to fetch news listing: ${response.status}`
			);
		}

		const html = await response.text();
		const $ = cheerio.load(html);
		const items: NewsItem[] = [];

		// Find all news links
		$("a[href*='/sc/news/detail/']").each((_, elem) => {
			const link = $(elem);
			const href = link.attr("href") || "";
			const match = href.match(/\/sc\/news\/detail\/([^/]+)\/?/);
			if (!match) return;

			const newsId = match[1];
			const title = link.text().trim();

			// Skip empty titles or navigation links
			if (!title || title === "詳細" || title === "もっと見る") return;

			const date = extractDateNearElement($, link);
			const fullUrl = new URL(href, BASE_URL).toString();

			items.push({
				id: newsId,
				title,
				date: parseJstDateToIso8601(date),
				url: fullUrl,
				category,
			});
		});

		const totalPages = extractTotalPages($);

		return { items, totalPages };
	}

	/**
	 * Fetch full news article content.
	 */
	async getNewsDetail(newsId: string): Promise<NewsDetail> {
		const url = BASE_URL + NEWS_DETAIL_URL.replace("{news_id}", newsId);

		const response = await fetch(url, {
			headers: { "User-Agent": this.userAgent },
		});
		if (!response.ok) {
			throw new Error(`Failed to fetch news detail: ${response.status}`);
		}

		const html = await response.text();
		const $ = cheerio.load(html);

		// Extract title - usually in h1 or main heading
		let title = "";
		const titleElem = $("h1").first();
		if (titleElem.length) {
			title = titleElem.text().trim();
		} else {
			const headingElem = $("[class*='title'], [class*='heading']").first();
			if (headingElem.length) {
				title = headingElem.text().trim();
			}
		}

		// Extract date
		let date = "";
		const dateMatch = html.match(
			/(\d{4}[-/]\d{2}[-/]\d{2}(?:\s+\d{2}:\d{2})?)/
		);
		if (dateMatch) {
			date = dateMatch[1];
		}

		// Determine category from breadcrumbs or navigation
		const category = detectCategory($);

		// Extract main content
		const content = extractContent($);

		return {
			id: newsId,
			title,
			date: parseJstDateToIso8601(date),
			category,
			contentHtml: content.html,
			contentText: content.text,
			url,
		};
	}

	/**
	 * Fetch news listings from multiple categories.
	 */
	async getAllListings(
		categories?: NewsCategory[],
		maxPages: number = 1
	): Promise<NewsItem[]> {
		const cats =
			categories ??
			([
				NewsCategory.NEWS,
				NewsCategory.EVENTS,
				NewsCategory.UPDATES,
				NewsCategory.MAINTENANCE,
			] as NewsCategory[]);

		const allItems: NewsItem[] = [];

		for (const category of cats) {
			for (let page = 1; page <= maxPages; page++) {
				const { items, totalPages } = await this.getNewsListing(
					category,
					page
				);
				allItems.push(...items);
				if (page >= totalPages) break;
			}
		}

		return allItems;
	}
}

export {
	NewsCategory,
	CATEGORY_ENGLISH_NAMES,
	parseJstDateToIso8601,
};
