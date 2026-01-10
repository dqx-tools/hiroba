import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getNextCheckTime } from "@hiroba/shared";

/**
 * Tests for the recheck queue filtering logic.
 *
 * Since mocking Drizzle is complex, we test the filtering logic in isolation
 * by simulating what getRecheckQueue does with the raw data.
 */
describe("getRecheckQueue filtering logic", () => {
	const NOW = 1736500000000; // Fixed timestamp in ms

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// Helper to create Unix seconds from hours ago
	const hoursAgo = (hours: number): number =>
		Math.floor((NOW - hours * 60 * 60 * 1000) / 1000);

	const daysAgo = (days: number): number => hoursAgo(days * 24);

	// Simulate the getRecheckQueue filtering logic
	const filterRecheckQueue = (
		items: Array<{
			id: string;
			titleJa: string;
			category: string;
			publishedAt: number;
			bodyFetchedAt: number | null;
		}>,
		limit: number = 50,
	) => {
		return items
			.filter((item) => item.bodyFetchedAt !== null)
			.map((item) => ({
				id: item.id,
				titleJa: item.titleJa,
				category: item.category,
				publishedAt: item.publishedAt,
				bodyFetchedAt: item.bodyFetchedAt!,
				nextCheckAt: getNextCheckTime(item.publishedAt, item.bodyFetchedAt!),
			}))
			.filter((item) => item.nextCheckAt <= Date.now())
			.sort((a, b) => a.nextCheckAt - b.nextCheckAt)
			.slice(0, limit);
	};

	it("filters out items without bodyFetchedAt", () => {
		const items = [
			{ id: "1", titleJa: "Test", category: "info", publishedAt: daysAgo(3), bodyFetchedAt: null },
		];
		expect(filterRecheckQueue(items)).toHaveLength(0);
	});

	it("includes items that are due for recheck", () => {
		// 3-day-old article, body fetched 6 hours ago
		// Interval = 3 hours, so should be due (6h > 3h)
		const items = [
			{
				id: "1",
				titleJa: "Test",
				category: "info",
				publishedAt: daysAgo(3),
				bodyFetchedAt: hoursAgo(6),
			},
		];
		const result = filterRecheckQueue(items);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("1");
	});

	it("excludes items not yet due for recheck", () => {
		// 7-day-old article, body fetched 2 hours ago
		// Interval = 7 hours, so NOT due (2h < 7h)
		const items = [
			{
				id: "1",
				titleJa: "Test",
				category: "info",
				publishedAt: daysAgo(7),
				bodyFetchedAt: hoursAgo(2),
			},
		];
		expect(filterRecheckQueue(items)).toHaveLength(0);
	});

	it("correctly handles 1-week-old articles with various fetch times", () => {
		// 7-day-old article has interval of 7 hours
		const items = [
			{
				id: "due",
				titleJa: "Due",
				category: "info",
				publishedAt: daysAgo(7),
				bodyFetchedAt: hoursAgo(8), // 8h ago, interval 7h -> DUE
			},
			{
				id: "not-due",
				titleJa: "Not Due",
				category: "info",
				publishedAt: daysAgo(7),
				bodyFetchedAt: hoursAgo(4), // 4h ago, interval 7h -> NOT DUE
			},
		];
		const result = filterRecheckQueue(items);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("due");
	});

	it("sorts by nextCheckAt ascending (most overdue first)", () => {
		const items = [
			{
				id: "less-overdue",
				titleJa: "Less Overdue",
				category: "info",
				publishedAt: daysAgo(3), // interval 3h
				bodyFetchedAt: hoursAgo(4), // 1h overdue
			},
			{
				id: "more-overdue",
				titleJa: "More Overdue",
				category: "info",
				publishedAt: daysAgo(3), // interval 3h
				bodyFetchedAt: hoursAgo(10), // 7h overdue
			},
		];
		const result = filterRecheckQueue(items);
		expect(result).toHaveLength(2);
		expect(result[0].id).toBe("more-overdue");
		expect(result[1].id).toBe("less-overdue");
	});

	it("respects the limit parameter", () => {
		const items = Array.from({ length: 10 }, (_, i) => ({
			id: String(i),
			titleJa: `Test ${i}`,
			category: "info",
			publishedAt: daysAgo(3),
			bodyFetchedAt: hoursAgo(10),
		}));
		const result = filterRecheckQueue(items, 5);
		expect(result).toHaveLength(5);
	});

	describe("edge cases for article freshness", () => {
		it("1-day-old article with body fetched 2 hours ago is due", () => {
			// Interval = 1 hour for 1-day-old articles
			const items = [
				{
					id: "1",
					titleJa: "Test",
					category: "info",
					publishedAt: daysAgo(1),
					bodyFetchedAt: hoursAgo(2),
				},
			];
			const result = filterRecheckQueue(items);
			expect(result).toHaveLength(1);
		});

		it("article at exact boundary is included", () => {
			// 1-day-old article, body fetched exactly 1 hour ago -> due now
			const items = [
				{
					id: "1",
					titleJa: "Test",
					category: "info",
					publishedAt: daysAgo(1),
					bodyFetchedAt: hoursAgo(1),
				},
			];
			const result = filterRecheckQueue(items);
			expect(result).toHaveLength(1);
		});

		it("very recent article (1 hour old) has 1 hour interval", () => {
			// 1-hour-old article, body fetched 30 minutes ago
			// Interval = 1 hour (minimum), so NOT due
			const items = [
				{
					id: "1",
					titleJa: "Test",
					category: "info",
					publishedAt: hoursAgo(1),
					bodyFetchedAt: Math.floor((NOW - 30 * 60 * 1000) / 1000), // 30 min ago
				},
			];
			const result = filterRecheckQueue(items);
			expect(result).toHaveLength(0);
		});
	});
});
