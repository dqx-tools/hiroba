/**
 * Shared TypeScript types for the Hiroba news translation system.
 *
 * All timestamps are Unix timestamps in seconds unless otherwise noted.
 */

import type { Category } from "./constants";

/**
 * List scraper output (Phase 1 scraping).
 * Contains only metadata available from list pages.
 */
export interface ListItem {
	id: string;
	titleJa: string;
	category: Category;
	publishedAt: number;
}
