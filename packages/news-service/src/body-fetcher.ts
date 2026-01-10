/**
 * Body fetcher with single-flight concurrency control.
 *
 * Prevents duplicate fetches when multiple workers request the same
 * news body simultaneously.
 */

import { eq, and, or, lt, isNull } from "drizzle-orm";
import { newsItems, type Database } from "@hiroba/db";
import { LOCK_CONFIG } from "@hiroba/shared";
import { fetchNewsBody, type BodyContent } from "./body-scraper";

export type { BodyContent };

/**
 * Get news body, fetching from source if needed.
 * Uses single-flight pattern to prevent concurrent fetches.
 */
export async function getNewsBodyWithFetch(
	db: Database,
	id: string,
): Promise<BodyContent | null> {
	// Check current state
	const item = await db
		.select({
			contentJa: newsItems.contentJa,
			sourceUpdatedAt: newsItems.sourceUpdatedAt,
			bodyFetchingSince: newsItems.bodyFetchingSince,
		})
		.from(newsItems)
		.where(eq(newsItems.id, id))
		.get();

	if (!item) return null;

	// If body exists, return it
	if (item.contentJa !== null) {
		return {
			contentJa: item.contentJa,
			sourceUpdatedAt: item.sourceUpdatedAt!,
		};
	}

	// Try to claim the fetch lock
	const now = Math.floor(Date.now() / 1000);
	const staleThreshold = now - Math.floor(LOCK_CONFIG.bodyFetchStaleThreshold / 1000);

	const claimed = await db
		.update(newsItems)
		.set({ bodyFetchingSince: now })
		.where(
			and(
				eq(newsItems.id, id),
				or(
					isNull(newsItems.bodyFetchingSince),
					lt(newsItems.bodyFetchingSince, staleThreshold),
				),
			),
		)
		.returning({ id: newsItems.id });

	if (claimed.length > 0) {
		// We claimed the lock, do the fetch
		try {
			const body = await fetchNewsBody(id);

			await db
				.update(newsItems)
				.set({
					contentJa: body.contentJa,
					sourceUpdatedAt: body.sourceUpdatedAt,
					bodyFetchedAt: now,
					bodyFetchingSince: null,
				})
				.where(eq(newsItems.id, id));

			return body;
		} catch (error) {
			// Release lock on error
			await db
				.update(newsItems)
				.set({ bodyFetchingSince: null })
				.where(eq(newsItems.id, id));
			throw error;
		}
	}

	// Someone else is fetching, poll until done
	return pollForBody(db, id);
}

/**
 * Poll database waiting for another worker to complete the fetch.
 */
async function pollForBody(
	db: Database,
	id: string,
): Promise<BodyContent | null> {
	const maxWait = LOCK_CONFIG.bodyFetchMaxWait;
	const pollInterval = LOCK_CONFIG.bodyFetchPollInterval;
	const startTime = Date.now();

	while (Date.now() - startTime < maxWait) {
		await sleep(pollInterval);

		const item = await db
			.select({
				contentJa: newsItems.contentJa,
				sourceUpdatedAt: newsItems.sourceUpdatedAt,
				bodyFetchingSince: newsItems.bodyFetchingSince,
			})
			.from(newsItems)
			.where(eq(newsItems.id, id))
			.get();

		// Body is now available
		if (item && item.contentJa !== null) {
			return {
				contentJa: item.contentJa,
				sourceUpdatedAt: item.sourceUpdatedAt!,
			};
		}

		// Lock was released without body (error case) - we could try to claim
		if (item && item.bodyFetchingSince === null) {
			// Other worker failed, try to fetch ourselves
			return getNewsBodyWithFetch(db, id);
		}
	}

	throw new Error("Timeout waiting for body fetch");
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
