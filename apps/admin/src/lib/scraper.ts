/**
 * News list scraper for admin operations.
 * Duplicated from apps/api for admin app independence.
 */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { SCRAPE_CONFIG, parseJstDateToUnix, type Category, type ListItem } from "@hiroba/shared";

const BASE_URL = SCRAPE_CONFIG.baseUrl;

const CATEGORY_TO_ID: Record<Category, number> = {
	news: 0,
	event: 1,
	update: 2,
	maintenance: 3,
};

function extractDateNearElement(
	$: cheerio.CheerioAPI,
	element: cheerio.Cheerio<AnyNode>,
): string {
	const parentTd = element.closest("td");
	if (parentTd.length) {
		const dateTd = parentTd.siblings("td.date").first();
		if (dateTd.length) {
			const text = dateTd.text().trim();
			const match = text.match(/(\d{4}[-/]\d{2}[-/]\d{2}(?:\s+\d{2}:\d{2})?)/);
			if (match) return match[1];
		}
	}

	const row = element.closest("tr");
	if (row.length) {
		const text = row.text();
		const match = text.match(/(\d{4}[-/]\d{2}[-/]\d{2}(?:\s+\d{2}:\d{2})?)/);
		if (match) return match[1];
	}

	return "";
}

function extractTotalPages($: cheerio.CheerioAPI): number {
	let maxPage = 1;

	$("a[href*='/sc/news/category/']").each((_, elem) => {
		const href = $(elem).attr("href") || "";
		const match = href.match(/\/sc\/news\/category\/\d+\/(\d+)/);
		if (match) {
			const pageNum = parseInt(match[1]);
			maxPage = Math.max(maxPage, pageNum);
		}
	});

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

function parseListPage(html: string, category: Category): ListItem[] {
	const $ = cheerio.load(html);
	const items: ListItem[] = [];
	const seenIds = new Set<string>();

	$("a[href*='/sc/news/detail/']").each((_, elem) => {
		const link = $(elem);
		const href = link.attr("href") || "";
		const match = href.match(/\/sc\/news\/detail\/([^/]+)\/?/);
		if (!match) return;

		const newsId = match[1];
		if (seenIds.has(newsId)) return;
		seenIds.add(newsId);

		const title = link.text().trim();
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

export async function* scrapeNewsList(
	category: Category,
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
