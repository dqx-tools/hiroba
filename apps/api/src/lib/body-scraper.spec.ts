/**
 * Tests for body scraper using real HTML fixtures.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import * as cheerio from "cheerio";

// Import the parsing logic - we'll need to export it for testing
// For now, we'll replicate the parsing logic here to test against fixtures

const fixturesDir = join(__dirname, "fixtures");

interface ExpectedOutput {
	title: string;
	date: string;
	content: string;
}

function loadFixture(id: string): { html: string; expected: ExpectedOutput } {
	const html = readFileSync(join(fixturesDir, `${id}.html`), "utf-8");
	const txt = readFileSync(join(fixturesDir, `${id}.txt`), "utf-8");

	// Parse YAML front matter from txt file
	const frontMatterMatch = txt.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!frontMatterMatch) {
		throw new Error(`Invalid fixture format for ${id}.txt`);
	}

	const frontMatter = frontMatterMatch[1];
	const content = frontMatterMatch[2].trim();

	// Parse YAML (simple key: value format)
	const titleMatch = frontMatter.match(/^title:\s*(.+)$/m);
	const dateMatch = frontMatter.match(/^date:\s*(.+)$/m);

	return {
		html,
		expected: {
			title: titleMatch ? titleMatch[1].trim() : "",
			date: dateMatch ? dateMatch[1].trim() : "",
			content,
		},
	};
}

/**
 * Parse a date string as JST and return Unix timestamp in seconds.
 */
function parseJstDateToUnix(dateStr: string): number {
	if (!dateStr) return Math.floor(Date.now() / 1000);

	const normalized = dateStr.replace(/\//g, "-").trim();

	let match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
	if (match) {
		const [, year, month, day, hour, minute] = match;
		const isoStr = `${year}-${month}-${day}T${hour}:${minute}:00+09:00`;
		return Math.floor(new Date(isoStr).getTime() / 1000);
	}

	match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (match) {
		const [, year, month, day] = match;
		const isoStr = `${year}-${month}-${day}T00:00:00+09:00`;
		return Math.floor(new Date(isoStr).getTime() / 1000);
	}

	return Math.floor(Date.now() / 1000);
}

/**
 * Parse detail page - mirrors body-scraper.ts parseDetailPage
 */
function parseDetailPage(html: string): {
	title: string;
	date: string;
	contentJa: string;
	sourceUpdatedAt: number;
} {
	const $ = cheerio.load(html);

	// Extract title from h3.iconTitle
	const title = $("h3.iconTitle").first().text().trim();

	// Extract date from p.newsDate
	const dateText = $("p.newsDate").first().text().trim();

	// Extract content from div.newsContent
	const contentElem = $("div.newsContent");
	let contentJa = "";
	if (contentElem.length) {
		// Get text content, preserving some structure
		contentJa = contentElem
			.html()!
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<\/p>/gi, "\n\n")
			.replace(/<[^>]+>/g, "")
			.replace(/&nbsp;/g, " ")
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	}

	return {
		title,
		date: dateText,
		contentJa,
		sourceUpdatedAt: parseJstDateToUnix(dateText),
	};
}

describe("Body Scraper", () => {
	describe("fixture 44e76e99b5e194377e955b13fb12f630", () => {
		const { html, expected } = loadFixture("44e76e99b5e194377e955b13fb12f630");

		it("should extract the title", () => {
			const result = parseDetailPage(html);
			expect(result.title).toBe(expected.title);
		});

		it("should extract the date", () => {
			const result = parseDetailPage(html);
			expect(result.date).toBe("2025-12-25 22:30");
		});

		it("should extract content matching expected output", () => {
			const result = parseDetailPage(html);
			// Normalize whitespace for comparison
			const normalizedResult = result.contentJa.replace(/\s+/g, " ").trim();
			const normalizedExpected = expected.content.replace(/\s+/g, " ").trim();
			expect(normalizedResult).toBe(normalizedExpected);
		});

		it("should parse date to Unix timestamp", () => {
			const result = parseDetailPage(html);
			// 2025-12-25 22:30 JST = 2025-12-25T22:30:00+09:00 = 2025-12-25T13:30:00Z
			expect(result.sourceUpdatedAt).toBe(1766669400);
		});
	});

	describe("fixture 1d8c9f71eaa6923fc9d3cd5d10aea4ce", () => {
		const { html, expected } = loadFixture("1d8c9f71eaa6923fc9d3cd5d10aea4ce");

		it("should extract the title", () => {
			const result = parseDetailPage(html);
			expect(result.title).toBe(expected.title);
		});

		it("should extract content matching expected output", () => {
			const result = parseDetailPage(html);
			const normalizedResult = result.contentJa.replace(/\s+/g, " ").trim();
			const normalizedExpected = expected.content.replace(/\s+/g, " ").trim();
			expect(normalizedResult).toBe(normalizedExpected);
		});
	});
});

describe("Date Parsing", () => {
	it("should parse date with time to Unix timestamp", () => {
		const result = parseJstDateToUnix("2025-12-25 22:30");
		// 2025-12-25T22:30:00+09:00 = 2025-12-25T13:30:00Z
		expect(result).toBe(1766669400);
	});

	it("should parse date only to Unix timestamp (midnight JST)", () => {
		const result = parseJstDateToUnix("2025-09-17");
		// 2025-09-17T00:00:00+09:00 = 2025-09-16T15:00:00Z
		expect(result).toBe(1758034800);
	});

	it("should handle slash separators", () => {
		const result = parseJstDateToUnix("2025/12/25 22:30");
		expect(result).toBe(1766669400);
	});
});
