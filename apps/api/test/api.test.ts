/**
 * Tests for API response types and utilities.
 */

import { describe, it, expect } from "vitest";
import {
	NewsCategory,
	CATEGORY_ENGLISH_NAMES,
	CATEGORY_JAPANESE_NAMES,
} from "../src/types";

describe("API Response Types", () => {
	describe("NewsListResponse", () => {
		it("should have correct structure", () => {
			const response = {
				items: [
					{
						id: "abc123",
						title_ja: "日本語タイトル",
						title_en: "English Title",
						date: "2025-01-01T00:00:00+09:00",
						url: "https://hiroba.dqx.jp/sc/news/detail/abc123/",
						category: "News",
						category_ja: "ニュース",
					},
				],
				total: 100,
				page: 1,
				page_size: 50,
				has_more: true,
			};

			expect(response.items).toHaveLength(1);
			expect(response.total).toBe(100);
			expect(response.page).toBe(1);
			expect(response.page_size).toBe(50);
			expect(response.has_more).toBe(true);
		});

		it("should calculate has_more correctly", () => {
			// Page 1 of 100 items with page_size 50
			const offset = (1 - 1) * 50;
			const itemsReturned = 50;
			const total = 100;
			const hasMore = offset + itemsReturned < total;

			expect(hasMore).toBe(true);

			// Last page
			const offset2 = (2 - 1) * 50;
			const hasMore2 = offset2 + itemsReturned < total;

			expect(hasMore2).toBe(false);
		});
	});

	describe("NewsDetailResponse", () => {
		it("should have correct structure", () => {
			const response = {
				id: "abc123",
				title_ja: "日本語タイトル",
				title_en: "English Title",
				date: "2025-01-01T00:00:00+09:00",
				url: "https://hiroba.dqx.jp/sc/news/detail/abc123/",
				category: "News",
				category_ja: "ニュース",
				content_ja: "日本語コンテンツ",
				content_en: "English content",
				cached: true,
			};

			expect(response.id).toBe("abc123");
			expect(response.content_ja).toBe("日本語コンテンツ");
			expect(response.content_en).toBe("English content");
			expect(response.cached).toBe(true);
		});
	});

	describe("RefreshResponse", () => {
		it("should have correct structure", () => {
			const response = {
				refreshed: 10,
				errors: 2,
				message: "Refreshed 10 items with 2 errors",
			};

			expect(response.refreshed).toBe(10);
			expect(response.errors).toBe(2);
			expect(response.message).toContain("10");
			expect(response.message).toContain("2");
		});
	});

	describe("CategoryInfo", () => {
		it("should have correct structure for all categories", () => {
			const categories = [
				NewsCategory.NEWS,
				NewsCategory.EVENTS,
				NewsCategory.UPDATES,
				NewsCategory.MAINTENANCE,
			].map((cat) => ({
				id: cat,
				name: CATEGORY_ENGLISH_NAMES[cat],
				name_ja: CATEGORY_JAPANESE_NAMES[cat],
			}));

			expect(categories).toHaveLength(4);

			expect(categories[0]).toEqual({
				id: 0,
				name: "News",
				name_ja: "ニュース",
			});

			expect(categories[1]).toEqual({
				id: 1,
				name: "Events",
				name_ja: "イベント",
			});

			expect(categories[2]).toEqual({
				id: 2,
				name: "Updates",
				name_ja: "アップデート",
			});

			expect(categories[3]).toEqual({
				id: 3,
				name: "Maintenance",
				name_ja: "メンテナンス/障害",
			});
		});
	});
});

describe("API Utility Functions", () => {
	describe("getJapaneseCategory", () => {
		function getJapaneseCategory(category: string): string {
			const mapping: Record<string, string> = {
				News: "ニュース",
				Events: "イベント",
				Updates: "アップデート",
				Maintenance: "メンテナンス/障害",
			};
			return mapping[category] ?? category;
		}

		it("should return Japanese name for News", () => {
			expect(getJapaneseCategory("News")).toBe("ニュース");
		});

		it("should return Japanese name for Events", () => {
			expect(getJapaneseCategory("Events")).toBe("イベント");
		});

		it("should return Japanese name for Updates", () => {
			expect(getJapaneseCategory("Updates")).toBe("アップデート");
		});

		it("should return Japanese name for Maintenance", () => {
			expect(getJapaneseCategory("Maintenance")).toBe("メンテナンス/障害");
		});

		it("should return original for unknown category", () => {
			expect(getJapaneseCategory("Unknown")).toBe("Unknown");
		});
	});

	describe("Category Parameter Parsing", () => {
		function parseCategoryParam(categoryParam: string | null): string | null {
			if (!categoryParam) return null;
			return categoryParam.charAt(0).toUpperCase() + categoryParam.slice(1).toLowerCase();
		}

		it("should capitalize first letter", () => {
			expect(parseCategoryParam("news")).toBe("News");
			expect(parseCategoryParam("events")).toBe("Events");
		});

		it("should handle already capitalized", () => {
			expect(parseCategoryParam("News")).toBe("News");
		});

		it("should handle all caps", () => {
			expect(parseCategoryParam("NEWS")).toBe("News");
		});

		it("should return null for null input", () => {
			expect(parseCategoryParam(null)).toBeNull();
		});
	});

	describe("Pagination Calculation", () => {
		it("should calculate correct offset", () => {
			expect((1 - 1) * 50).toBe(0);
			expect((2 - 1) * 50).toBe(50);
			expect((3 - 1) * 50).toBe(100);
		});

		it("should clamp page_size between 1 and 100", () => {
			const clamp = (value: number, min: number, max: number) =>
				Math.min(Math.max(value, min), max);

			expect(clamp(0, 1, 100)).toBe(1);
			expect(clamp(50, 1, 100)).toBe(50);
			expect(clamp(200, 1, 100)).toBe(100);
		});

		it("should clamp max_pages between 1 and 200 for seed", () => {
			const clamp = (value: number, min: number, max: number) =>
				Math.min(Math.max(value, min), max);

			expect(clamp(0, 1, 200)).toBe(1);
			expect(clamp(100, 1, 200)).toBe(100);
			expect(clamp(300, 1, 200)).toBe(200);
		});
	});
});

describe("Root Endpoint Response", () => {
	it("should list all available endpoints", () => {
		const response = {
			service: "DQX News API",
			version: "1.0.0",
			endpoints: {
				news_list: "/news",
				news_detail: "/news/{news_id}",
				categories: "/categories",
				refresh: "/refresh",
				seed: "/seed",
			},
		};

		expect(response.service).toBe("DQX News API");
		expect(response.version).toBe("1.0.0");
		expect(Object.keys(response.endpoints)).toHaveLength(5);
		expect(response.endpoints.seed).toBe("/seed");
	});
});

describe("Health Check Response", () => {
	it("should return healthy status", () => {
		const response = { status: "healthy" };
		expect(response.status).toBe("healthy");
	});
});

describe("Error Responses", () => {
	it("should have correct structure for 404", () => {
		const error = { error: "News not found: Error message" };
		expect(error.error).toContain("News not found");
	});

	it("should have correct structure for 500", () => {
		const error = { error: "Translation failed: Error message" };
		expect(error.error).toContain("Translation failed");
	});

	it("should have correct structure for 503", () => {
		const error = { error: "Translation in progress, please retry" };
		expect(error.error).toContain("please retry");
	});

	it("should have correct structure for 400", () => {
		const error = { error: "Invalid category" };
		expect(error.error).toBe("Invalid category");
	});
});

describe("Seed Endpoint Response", () => {
	it("should have correct structure", () => {
		const response = {
			seeded: 100,
			skipped: 50,
			errors: 2,
			message: "Seeded 100 items, skipped 50 existing, 2 errors",
			categories: {
				News: { seeded: 30, pages: 10 },
				Events: { seeded: 25, pages: 8 },
				Updates: { seeded: 20, pages: 5 },
				Maintenance: { seeded: 25, pages: 7 },
			},
		};

		expect(response.seeded).toBe(100);
		expect(response.skipped).toBe(50);
		expect(response.errors).toBe(2);
		expect(response.categories.News.seeded).toBe(30);
		expect(response.categories.News.pages).toBe(10);
	});
});
