/**
 * Body scraper for fetching news detail page content.
 */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { SCRAPE_CONFIG } from "@hiroba/shared";

export interface BodyContent {
	contentJa: string;
	sourceUpdatedAt: number;
}

/**
 * Fetch and parse the detail page for a news item.
 */
export async function fetchNewsBody(id: string): Promise<BodyContent> {
	const url = `${SCRAPE_CONFIG.baseUrl}${SCRAPE_CONFIG.newsDetailPath}${id}/`;

	const response = await fetch(url, {
		headers: {
			"User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch detail page: ${response.status}`);
	}

	const html = await response.text();
	return parseDetailPage(html);
}

/**
 * Parse a date string as JST and return Unix timestamp in seconds.
 */
function parseJstDateToUnix(dateStr: string): number {
	if (!dateStr) return Math.floor(Date.now() / 1000);

	// Normalize separators
	const normalized = dateStr.replace(/\//g, "-").trim();

	// Try parsing with time: "2024-01-15 10:30"
	let match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
	if (match) {
		const [, year, month, day, hour, minute] = match;
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

	return Math.floor(Date.now() / 1000);
}

/**
 * Extract the main content from a detail page.
 */
function parseDetailPage(html: string): BodyContent {
	const $ = cheerio.load(html);

	// Extract source updated timestamp from page
	let sourceUpdatedAt = Math.floor(Date.now() / 1000);
	const dateMatch = html.match(
		/(\d{4}[-/]\d{2}[-/]\d{2}(?:\s+\d{2}:\d{2})?)/,
	);
	if (dateMatch) {
		sourceUpdatedAt = parseJstDateToUnix(dateMatch[1]);
	}

	// Try to find main content area using various selectors
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
			contentElem.find("nav, header, footer, script, style").remove();
		}
	}

	let contentJa = "";
	if (contentElem && contentElem.length) {
		// Get text content, normalize whitespace
		contentJa = contentElem.text().replace(/\s+/g, " ").trim();
	}

	return {
		contentJa,
		sourceUpdatedAt,
	};
}
