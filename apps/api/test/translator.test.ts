/**
 * Tests for translator module.
 */

import { describe, it, expect } from "vitest";
import { NewsCategory, CATEGORY_ENGLISH_NAMES, CATEGORY_JAPANESE_NAMES } from "../src/types";

// Test the content hash function
async function computeContentHash(content: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(content);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
	return hashHex.slice(0, 16);
}

describe("Content Hash", () => {
	it("should compute consistent hash for same content", async () => {
		const content = "Hello, World!";
		const hash1 = await computeContentHash(content);
		const hash2 = await computeContentHash(content);

		expect(hash1).toBe(hash2);
	});

	it("should compute different hash for different content", async () => {
		const hash1 = await computeContentHash("Hello");
		const hash2 = await computeContentHash("World");

		expect(hash1).not.toBe(hash2);
	});

	it("should return 16 character hex string", async () => {
		const hash = await computeContentHash("Test content");

		expect(hash).toMatch(/^[a-f0-9]{16}$/);
	});

	it("should handle empty string", async () => {
		const hash = await computeContentHash("");

		expect(hash).toMatch(/^[a-f0-9]{16}$/);
	});

	it("should handle Japanese content", async () => {
		const hash = await computeContentHash("日本語コンテンツ");

		expect(hash).toMatch(/^[a-f0-9]{16}$/);
	});

	it("should handle long content", async () => {
		const longContent = "a".repeat(100000);
		const hash = await computeContentHash(longContent);

		expect(hash).toMatch(/^[a-f0-9]{16}$/);
	});
});

describe("Category Names", () => {
	it("should have correct English names", () => {
		expect(CATEGORY_ENGLISH_NAMES[NewsCategory.NEWS]).toBe("News");
		expect(CATEGORY_ENGLISH_NAMES[NewsCategory.EVENTS]).toBe("Events");
		expect(CATEGORY_ENGLISH_NAMES[NewsCategory.UPDATES]).toBe("Updates");
		expect(CATEGORY_ENGLISH_NAMES[NewsCategory.MAINTENANCE]).toBe("Maintenance");
	});

	it("should have correct Japanese names", () => {
		expect(CATEGORY_JAPANESE_NAMES[NewsCategory.NEWS]).toBe("ニュース");
		expect(CATEGORY_JAPANESE_NAMES[NewsCategory.EVENTS]).toBe("イベント");
		expect(CATEGORY_JAPANESE_NAMES[NewsCategory.UPDATES]).toBe("アップデート");
		expect(CATEGORY_JAPANESE_NAMES[NewsCategory.MAINTENANCE]).toBe("メンテナンス/障害");
	});
});

describe("Translation Prompts", () => {
	const TITLE_SYSTEM_PROMPT = `You are a professional translator specializing in Japanese video game content,
particularly Dragon Quest X (DQX) online game. Translate the following Japanese text to natural English.
Keep game-specific terms, item names, and location names that players would recognize.
Be concise but accurate.`;

	const CONTENT_SYSTEM_PROMPT = `You are a professional translator specializing in Japanese video game content,
particularly Dragon Quest X (DQX) online game. Translate the following Japanese text to natural English.

Guidelines:
- Keep game-specific terms, item names, location names, and character names that players would recognize
- Preserve any formatting like bullet points, numbered lists, dates, and times
- Convert Japanese date/time formats to be internationally readable while keeping original values
- Keep URLs and technical identifiers unchanged
- Maintain the original tone (official announcements should sound official)
- If there are instructions or steps, ensure they remain clear and actionable`;

	it("should have appropriate title prompt", () => {
		expect(TITLE_SYSTEM_PROMPT).toContain("Dragon Quest X");
		expect(TITLE_SYSTEM_PROMPT).toContain("translator");
		expect(TITLE_SYSTEM_PROMPT).toContain("Japanese");
		expect(TITLE_SYSTEM_PROMPT).toContain("English");
		expect(TITLE_SYSTEM_PROMPT).toContain("concise");
	});

	it("should have appropriate content prompt with guidelines", () => {
		expect(CONTENT_SYSTEM_PROMPT).toContain("Dragon Quest X");
		expect(CONTENT_SYSTEM_PROMPT).toContain("game-specific terms");
		expect(CONTENT_SYSTEM_PROMPT).toContain("formatting");
		expect(CONTENT_SYSTEM_PROMPT).toContain("URLs");
		expect(CONTENT_SYSTEM_PROMPT).toContain("tone");
	});
});

describe("TranslatedNewsItem Type", () => {
	it("should have all required fields", () => {
		const item = {
			id: "abc123",
			titleJa: "日本語タイトル",
			titleEn: "English Title",
			date: "2025-01-01T00:00:00+09:00",
			url: "https://hiroba.dqx.jp/sc/news/detail/abc123/",
			category: "News",
			categoryJa: "ニュース",
		};

		expect(item.id).toBe("abc123");
		expect(item.titleJa).toBe("日本語タイトル");
		expect(item.titleEn).toBe("English Title");
		expect(item.category).toBe("News");
		expect(item.categoryJa).toBe("ニュース");
	});
});

describe("TranslatedNewsDetail Type", () => {
	it("should have all required fields including content", () => {
		const detail = {
			id: "abc123",
			titleJa: "日本語タイトル",
			titleEn: "English Title",
			date: "2025-01-01T00:00:00+09:00",
			url: "https://hiroba.dqx.jp/sc/news/detail/abc123/",
			category: "News",
			categoryJa: "ニュース",
			contentJa: "日本語コンテンツ",
			contentEn: "English content",
			contentHash: "abc123def456gh",
		};

		expect(detail.contentJa).toBe("日本語コンテンツ");
		expect(detail.contentEn).toBe("English content");
		expect(detail.contentHash).toMatch(/^[a-z0-9]+$/);
	});
});
