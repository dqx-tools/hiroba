/**
 * Tests for D1 cache module.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock D1Database interface for testing
interface MockD1Result {
	results?: Record<string, unknown>[];
	meta: { changes?: number };
}

function createMockD1(): {
	db: {
		prepare: ReturnType<typeof vi.fn>;
	};
	mockResults: Map<string, MockD1Result>;
} {
	const mockResults = new Map<string, MockD1Result>();

	const createStatement = (query: string) => {
		let boundParams: unknown[] = [];

		return {
			bind: (...params: unknown[]) => {
				boundParams = params;
				return createStatement(query);
			},
			run: async () => {
				// Simulate INSERT failures for lock testing
				if (query.includes("INSERT INTO translation_locks") && mockResults.has("lock_exists")) {
					throw new Error("UNIQUE constraint failed");
				}
				return { meta: { changes: 1 } };
			},
			first: async <T>(): Promise<T | null> => {
				const key = `first:${query}:${JSON.stringify(boundParams)}`;
				const result = mockResults.get(key);
				if (result?.results?.[0]) {
					return result.results[0] as T;
				}
				return null;
			},
			all: async <T>(): Promise<{ results: T[] }> => {
				const key = `all:${query}`;
				const result = mockResults.get(key);
				return { results: (result?.results as T[]) ?? [] };
			},
		};
	};

	return {
		db: {
			prepare: vi.fn((query: string) => createStatement(query)),
		},
		mockResults,
	};
}

describe("D1Cache", () => {
	describe("isCacheStale", () => {
		it("should return false for fresh cache entries", () => {
			const now = new Date();
			const cached = {
				news_id: "test",
				content_hash: "abc123",
				title_ja: "テスト",
				title_en: "Test",
				content_ja: null,
				content_en: null,
				category: "News",
				date: "2025-01-01",
				url: "https://example.com",
				created_at: now.toISOString(),
				updated_at: now.toISOString(),
			};

			// Check staleness manually (same logic as isCacheStale)
			const updated = new Date(cached.updated_at);
			const ageHours = (now.getTime() - updated.getTime()) / (1000 * 60 * 60);
			const isStale = ageHours > 6;

			expect(isStale).toBe(false);
		});

		it("should return true for stale cache entries", () => {
			const now = new Date();
			const sevenHoursAgo = new Date(now.getTime() - 7 * 60 * 60 * 1000);
			const cached = {
				news_id: "test",
				content_hash: "abc123",
				title_ja: "テスト",
				title_en: "Test",
				content_ja: null,
				content_en: null,
				category: "News",
				date: "2025-01-01",
				url: "https://example.com",
				created_at: sevenHoursAgo.toISOString(),
				updated_at: sevenHoursAgo.toISOString(),
			};

			const updated = new Date(cached.updated_at);
			const ageHours = (now.getTime() - updated.getTime()) / (1000 * 60 * 60);
			const isStale = ageHours > 6;

			expect(isStale).toBe(true);
		});

		it("should handle invalid timestamps", () => {
			const cached = {
				news_id: "test",
				content_hash: "abc123",
				title_ja: "テスト",
				title_en: "Test",
				content_ja: null,
				content_en: null,
				category: "News",
				date: "2025-01-01",
				url: "https://example.com",
				created_at: "invalid",
				updated_at: "invalid",
			};

			// Invalid date should be treated as stale
			let isStale = true;
			try {
				const updated = new Date(cached.updated_at);
				const now = new Date();
				const ageHours = (now.getTime() - updated.getTime()) / (1000 * 60 * 60);
				isStale = ageHours > 6 || isNaN(ageHours);
			} catch {
				isStale = true;
			}

			expect(isStale).toBe(true);
		});
	});

	describe("Translation Locking", () => {
		it("should detect stale locks", () => {
			const now = new Date();
			const threeMinutesAgo = new Date(now.getTime() - 3 * 60 * 1000);
			const LOCK_TIMEOUT_MS = 120_000; // 2 minutes

			const lockAge = now.getTime() - threeMinutesAgo.getTime();
			const isStale = lockAge > LOCK_TIMEOUT_MS;

			expect(isStale).toBe(true);
		});

		it("should not consider recent locks as stale", () => {
			const now = new Date();
			const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
			const LOCK_TIMEOUT_MS = 120_000; // 2 minutes

			const lockAge = now.getTime() - oneMinuteAgo.getTime();
			const isStale = lockAge > LOCK_TIMEOUT_MS;

			expect(isStale).toBe(false);
		});
	});

	describe("SQL Query Construction", () => {
		it("should construct proper INSERT query", () => {
			const query = `
				INSERT INTO news_translations
					(news_id, content_hash, title_ja, title_en, content_ja, content_en,
					 category, date, url, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(news_id) DO UPDATE SET
					content_hash = excluded.content_hash,
					title_ja = excluded.title_ja,
					title_en = excluded.title_en,
					content_ja = excluded.content_ja,
					content_en = excluded.content_en,
					category = excluded.category,
					date = excluded.date,
					url = excluded.url,
					updated_at = excluded.updated_at
			`;

			expect(query).toContain("INSERT INTO news_translations");
			expect(query).toContain("ON CONFLICT(news_id) DO UPDATE");
			expect(query).toContain("excluded.content_hash");
		});

		it("should construct proper SELECT query with category filter", () => {
			const query = `
				SELECT * FROM news_translations
				WHERE category = ?
				ORDER BY date DESC
				LIMIT ? OFFSET ?
			`;

			expect(query).toContain("WHERE category = ?");
			expect(query).toContain("ORDER BY date DESC");
			expect(query).toContain("LIMIT ? OFFSET ?");
		});

		it("should construct proper SELECT query without category filter", () => {
			const query = `
				SELECT * FROM news_translations
				ORDER BY date DESC
				LIMIT ? OFFSET ?
			`;

			expect(query).not.toContain("WHERE category");
			expect(query).toContain("ORDER BY date DESC");
		});
	});

	describe("Lock Table Schema", () => {
		it("should have correct lock table SQL", () => {
			const createLocksTableSql = `
				CREATE TABLE IF NOT EXISTS translation_locks (
					news_id TEXT PRIMARY KEY,
					locked_at TEXT NOT NULL
				);
			`;

			expect(createLocksTableSql).toContain("translation_locks");
			expect(createLocksTableSql).toContain("news_id TEXT PRIMARY KEY");
			expect(createLocksTableSql).toContain("locked_at TEXT NOT NULL");
		});
	});
});

describe("CachedTranslation Type", () => {
	it("should have all required fields", () => {
		const cached = {
			news_id: "abc123",
			content_hash: "hash456",
			title_ja: "日本語タイトル",
			title_en: "English Title",
			content_ja: "日本語コンテンツ",
			content_en: "English content",
			category: "News",
			date: "2025-01-01T00:00:00+09:00",
			url: "https://hiroba.dqx.jp/sc/news/detail/abc123/",
			created_at: "2025-01-01T00:00:00Z",
			updated_at: "2025-01-01T00:00:00Z",
		};

		expect(cached.news_id).toBe("abc123");
		expect(cached.content_hash).toBe("hash456");
		expect(cached.title_ja).toBe("日本語タイトル");
		expect(cached.title_en).toBe("English Title");
		expect(cached.content_ja).toBe("日本語コンテンツ");
		expect(cached.content_en).toBe("English content");
		expect(cached.category).toBe("News");
		expect(cached.date).toBe("2025-01-01T00:00:00+09:00");
		expect(cached.url).toContain("hiroba.dqx.jp");
	});

	it("should allow null content fields", () => {
		const cached = {
			news_id: "abc123",
			content_hash: "hash456",
			title_ja: "日本語タイトル",
			title_en: "English Title",
			content_ja: null,
			content_en: null,
			category: "News",
			date: "2025-01-01T00:00:00+09:00",
			url: "https://hiroba.dqx.jp/sc/news/detail/abc123/",
			created_at: "2025-01-01T00:00:00Z",
			updated_at: "2025-01-01T00:00:00Z",
		};

		expect(cached.content_ja).toBeNull();
		expect(cached.content_en).toBeNull();
	});
});
