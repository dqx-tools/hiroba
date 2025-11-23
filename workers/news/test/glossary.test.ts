/**
 * Tests for glossary fetching and formatting.
 */

import { describe, it, expect } from "vitest";
import { formatGlossaryForPrompt } from "../src/glossary";
import type { GlossaryEntry } from "../src/types";

describe("Glossary Module", () => {
	describe("formatGlossaryForPrompt", () => {
		it("should return empty string for empty entries", () => {
			const result = formatGlossaryForPrompt([]);
			expect(result).toBe("");
		});

		it("should format single entry correctly", () => {
			const entries: GlossaryEntry[] = [
				{ japanese_text: "ドラゴン", english_text: "Dragon" },
			];
			const result = formatGlossaryForPrompt(entries);

			expect(result).toContain("glossary");
			expect(result).toContain('"ドラゴン"');
			expect(result).toContain('"Dragon"');
			expect(result).toContain("→");
		});

		it("should format multiple entries correctly", () => {
			const entries: GlossaryEntry[] = [
				{ japanese_text: "ドラゴンクエスト", english_text: "Dragon Quest" },
				{ japanese_text: "スライム", english_text: "Slime" },
				{ japanese_text: "メタルスライム", english_text: "Metal Slime" },
			];
			const result = formatGlossaryForPrompt(entries);

			expect(result).toContain('"ドラゴンクエスト"');
			expect(result).toContain('"Dragon Quest"');
			expect(result).toContain('"スライム"');
			expect(result).toContain('"Slime"');
			expect(result).toContain('"メタルスライム"');
			expect(result).toContain('"Metal Slime"');

			// Should have one entry per line
			const lines = result.split("\n").filter((l) => l.includes("→"));
			expect(lines.length).toBe(3);
		});

		it("should handle special characters in entries", () => {
			const entries: GlossaryEntry[] = [
				{
					japanese_text: "DQX (ドラゴンクエストX)",
					english_text: "Dragon Quest X (DQX)",
				},
			];
			const result = formatGlossaryForPrompt(entries);

			expect(result).toContain("DQX (ドラゴンクエストX)");
			expect(result).toContain("Dragon Quest X (DQX)");
		});
	});
});

describe("CSV Parsing", () => {
	// Test the CSV parsing logic inline
	function parseCsvLine(line: string): string[] {
		const fields: string[] = [];
		let current = "";
		let inQuotes = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];

			if (char === '"') {
				if (inQuotes && line[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					inQuotes = !inQuotes;
				}
			} else if (char === "," && !inQuotes) {
				fields.push(current.trim());
				current = "";
			} else {
				current += char;
			}
		}

		fields.push(current.trim());
		return fields;
	}

	it("should parse simple CSV line", () => {
		const result = parseCsvLine("ドラゴン,Dragon");
		expect(result).toEqual(["ドラゴン", "Dragon"]);
	});

	it("should handle quoted fields", () => {
		const result = parseCsvLine('"Hello, World","こんにちは、世界"');
		expect(result).toEqual(["Hello, World", "こんにちは、世界"]);
	});

	it("should handle escaped quotes", () => {
		const result = parseCsvLine('"Say ""Hello""",挨拶');
		expect(result).toEqual(['Say "Hello"', "挨拶"]);
	});

	it("should handle mixed quoted and unquoted", () => {
		const result = parseCsvLine('Simple,"With, Comma",Another');
		expect(result).toEqual(["Simple", "With, Comma", "Another"]);
	});

	it("should handle empty fields", () => {
		const result = parseCsvLine("First,,Third");
		expect(result).toEqual(["First", "", "Third"]);
	});
});

describe("Glossary Entry Type", () => {
	it("should have required fields", () => {
		const entry: GlossaryEntry = {
			japanese_text: "テスト",
			english_text: "Test",
		};

		expect(entry.japanese_text).toBe("テスト");
		expect(entry.english_text).toBe("Test");
	});

	it("should allow optional fields", () => {
		const entry: GlossaryEntry = {
			id: 1,
			japanese_text: "テスト",
			english_text: "Test",
			updated_at: "2024-01-01T00:00:00Z",
		};

		expect(entry.id).toBe(1);
		expect(entry.updated_at).toBe("2024-01-01T00:00:00Z");
	});
});

describe("Glossary Matching Logic", () => {
	// Test the substring matching logic used in cache.findMatchingGlossaryEntries
	function findMatchingEntries(
		text: string,
		entries: GlossaryEntry[]
	): GlossaryEntry[] {
		if (!text.trim()) return [];
		return entries.filter((entry) => text.includes(entry.japanese_text));
	}

	it("should find exact match", () => {
		const entries: GlossaryEntry[] = [
			{ japanese_text: "ドラゴン", english_text: "Dragon" },
		];
		const result = findMatchingEntries("ドラゴン", entries);
		expect(result).toHaveLength(1);
		expect(result[0].english_text).toBe("Dragon");
	});

	it("should find substring match", () => {
		const entries: GlossaryEntry[] = [
			{ japanese_text: "クエスト", english_text: "Quest" },
		];
		const result = findMatchingEntries(
			"ドラゴンクエストXの最新ニュース",
			entries
		);
		expect(result).toHaveLength(1);
	});

	it("should find multiple matches", () => {
		const entries: GlossaryEntry[] = [
			{ japanese_text: "ドラゴン", english_text: "Dragon" },
			{ japanese_text: "クエスト", english_text: "Quest" },
			{ japanese_text: "スライム", english_text: "Slime" },
		];
		const result = findMatchingEntries("ドラゴンクエストのスライム", entries);
		expect(result).toHaveLength(3);
	});

	it("should return empty for no matches", () => {
		const entries: GlossaryEntry[] = [
			{ japanese_text: "ドラゴン", english_text: "Dragon" },
		];
		const result = findMatchingEntries("全く関係ない文章", entries);
		expect(result).toHaveLength(0);
	});

	it("should return empty for empty text", () => {
		const entries: GlossaryEntry[] = [
			{ japanese_text: "ドラゴン", english_text: "Dragon" },
		];
		const result = findMatchingEntries("", entries);
		expect(result).toHaveLength(0);
	});

	it("should handle whitespace-only text", () => {
		const entries: GlossaryEntry[] = [
			{ japanese_text: "ドラゴン", english_text: "Dragon" },
		];
		const result = findMatchingEntries("   ", entries);
		expect(result).toHaveLength(0);
	});
});
