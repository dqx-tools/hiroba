/**
 * Tests for DQX News scraper with real HTML fixtures.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import * as cheerio from "cheerio";
import { NewsCategory } from "../src/types";

// Load fixtures
const fixturesDir = join(__dirname, "fixtures");

function loadFixture(filename: string): string {
	return readFileSync(join(fixturesDir, filename), "utf-8");
}

// Import the scraper internals for testing
// We'll test the parsing logic directly with fixtures

describe("News Listing Parser", () => {
	let newsListingHtml: string;
	let eventsListingHtml: string;

	beforeAll(() => {
		newsListingHtml = loadFixture("news-listing-category-0.html");
		eventsListingHtml = loadFixture("news-listing-category-1.html");
	});

	it("should load the news listing fixture", () => {
		expect(newsListingHtml).toBeDefined();
		expect(newsListingHtml.length).toBeGreaterThan(1000);
		expect(newsListingHtml).toContain("hiroba.dqx.jp");
	});

	it("should find news links in the listing", () => {
		const $ = cheerio.load(newsListingHtml);
		const newsLinks = $('a[href*="/sc/news/detail/"]');

		expect(newsLinks.length).toBeGreaterThan(0);
		// Should have multiple news items
		expect(newsLinks.length).toBeGreaterThanOrEqual(10);
	});

	it("should extract news IDs from links", () => {
		const $ = cheerio.load(newsListingHtml);
		const newsIds: string[] = [];

		$('a[href*="/sc/news/detail/"]').each((_, elem) => {
			const href = $(elem).attr("href") || "";
			const match = href.match(/\/sc\/news\/detail\/([^/]+)\/?/);
			if (match) {
				newsIds.push(match[1]);
			}
		});

		expect(newsIds.length).toBeGreaterThan(0);
		// News IDs should be hex strings
		newsIds.forEach(id => {
			expect(id).toMatch(/^[a-f0-9]+$/);
		});
	});

	it("should extract titles from news links", () => {
		const $ = cheerio.load(newsListingHtml);
		const titles: string[] = [];

		$('td.news a[href*="/sc/news/detail/"]').each((_, elem) => {
			const title = $(elem).text().trim();
			if (title && title !== "詳細" && title !== "もっと見る") {
				titles.push(title);
			}
		});

		expect(titles.length).toBeGreaterThan(0);
		// Titles should be non-empty Japanese text
		titles.forEach(title => {
			expect(title.length).toBeGreaterThan(0);
		});
	});

	it("should extract dates from the listing", () => {
		const $ = cheerio.load(newsListingHtml);
		const dates: string[] = [];

		$('td.date div').each((_, elem) => {
			const date = $(elem).text().trim();
			if (date) {
				dates.push(date);
			}
		});

		expect(dates.length).toBeGreaterThan(0);
		// Dates should match YYYY-MM-DD HH:MM format
		dates.forEach(date => {
			expect(date).toMatch(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/);
		});
	});

	it("should parse complete news items with all fields", () => {
		const $ = cheerio.load(newsListingHtml);
		const items: Array<{ id: string; title: string; date: string; url: string }> = [];

		// Each news item is in a <tr> with a <td class="news"> and a sibling <td class="date">
		$('td.news a[href*="/sc/news/detail/"]').each((_, elem) => {
			const link = $(elem);
			const href = link.attr("href") || "";
			const match = href.match(/\/sc\/news\/detail\/([^/]+)\/?/);
			if (!match) return;

			const title = link.text().trim();
			if (!title || title === "詳細" || title === "もっと見る") return;

			// Find the date in the same row
			const row = link.closest("tr");
			const dateCell = row.find("td.date div");
			const date = dateCell.text().trim();

			items.push({
				id: match[1],
				title,
				date,
				url: `https://hiroba.dqx.jp${href}`,
			});
		});

		expect(items.length).toBeGreaterThan(0);

		// Verify first item has all fields
		const firstItem = items[0];
		expect(firstItem.id).toBeDefined();
		expect(firstItem.id.length).toBeGreaterThan(0);
		expect(firstItem.title).toBeDefined();
		expect(firstItem.title.length).toBeGreaterThan(0);
		expect(firstItem.date).toMatch(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/);
		expect(firstItem.url).toContain("hiroba.dqx.jp");
	});

	it("should handle events category (category 1)", () => {
		const $ = cheerio.load(eventsListingHtml);
		const newsLinks = $('a[href*="/sc/news/detail/"]');

		expect(newsLinks.length).toBeGreaterThan(0);
	});
});

describe("News Detail Parser", () => {
	let detailHtml: string;

	beforeAll(() => {
		detailHtml = loadFixture("news-detail-sample.html");
	});

	it("should load the detail fixture", () => {
		expect(detailHtml).toBeDefined();
		expect(detailHtml.length).toBeGreaterThan(1000);
	});

	it("should extract the title", () => {
		const $ = cheerio.load(detailHtml);

		// Try h3.iconTitle first (main title)
		let title = $("h3.iconTitle").first().text().trim();

		if (!title) {
			// Fallback to h1
			title = $("h1").first().text().trim();
		}

		expect(title).toBeDefined();
		expect(title.length).toBeGreaterThan(0);
		// This specific fixture should have this title
		expect(title).toContain("HD-2D版");
	});

	it("should extract the date", () => {
		const $ = cheerio.load(detailHtml);

		const dateText = $("p.newsDate").first().text().trim();

		expect(dateText).toBeDefined();
		expect(dateText).toMatch(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/);
		// This specific fixture should have this date
		expect(dateText).toBe("2025-10-30 12:00");
	});

	it("should extract the content", () => {
		const $ = cheerio.load(detailHtml);

		const contentElem = $("div.newsContent");
		expect(contentElem.length).toBe(1);

		const contentHtml = contentElem.html();
		const contentText = contentElem.text().trim();

		expect(contentHtml).toBeDefined();
		expect(contentHtml!.length).toBeGreaterThan(0);
		expect(contentText.length).toBeGreaterThan(0);

		// This specific fixture should contain certain content
		expect(contentText).toContain("ドラゴンクエスト");
	});

	it("should identify the body element for category detection", () => {
		const $ = cheerio.load(detailHtml);

		// The body should have id="newsDetail"
		const bodyId = $("body").attr("id");
		expect(bodyId).toBe("newsDetail");
	});
});

describe("Date Parsing", () => {
	// Test the date parsing function (mirrors src/scraper.ts implementation)
	function parseJstDateToIso8601(dateStr: string): string {
		if (!dateStr) return "";

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

		return dateStr;
	}

	it("should parse date with time", () => {
		const result = parseJstDateToIso8601("2025-10-30 12:00");
		expect(result).toContain("2025-10-30");
		expect(result).toContain("+09:00");
	});

	it("should parse date only", () => {
		const result = parseJstDateToIso8601("2025-10-30");
		expect(result).toContain("2025-10-30");
		expect(result).toContain("+09:00");
	});

	it("should handle slash separators", () => {
		const result = parseJstDateToIso8601("2025/10/30 12:00");
		expect(result).toContain("2025-10-30");
	});

	it("should return original for invalid format", () => {
		const result = parseJstDateToIso8601("invalid");
		expect(result).toBe("invalid");
	});

	it("should handle empty string", () => {
		const result = parseJstDateToIso8601("");
		expect(result).toBe("");
	});
});

describe("Category Enum", () => {
	it("should have correct values", () => {
		expect(NewsCategory.NEWS).toBe(0);
		expect(NewsCategory.EVENTS).toBe(1);
		expect(NewsCategory.UPDATES).toBe(2);
		expect(NewsCategory.MAINTENANCE).toBe(3);
	});
});

describe("Pagination", () => {
	let newsListingHtml: string;

	beforeAll(() => {
		newsListingHtml = loadFixture("news-listing-category-0.html");
	});

	it("should find pagination links", () => {
		const $ = cheerio.load(newsListingHtml);

		// Look for pagination links
		const paginationLinks = $('a[href*="/sc/news/category/0/"]');

		// Should have pagination (page 2, 3, etc.)
		expect(paginationLinks.length).toBeGreaterThan(0);
	});

	it("should extract max page number", () => {
		const $ = cheerio.load(newsListingHtml);
		let maxPage = 1;

		$('a[href*="/sc/news/category/"]').each((_, elem) => {
			const href = $(elem).attr("href") || "";
			const match = href.match(/\/sc\/news\/category\/\d+\/(\d+)/);
			if (match) {
				const pageNum = parseInt(match[1]);
				maxPage = Math.max(maxPage, pageNum);
			}
		});

		// Should have multiple pages
		expect(maxPage).toBeGreaterThan(1);
	});
});
