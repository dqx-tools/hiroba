/**
 * News service package - core business logic for news operations.
 *
 * Provides database operations, body fetching, and translation services.
 */

// News repository operations
export {
	upsertListItems,
	getNewsItems,
	getNewsItem,
	getStats,
	getRecheckQueue,
	invalidateBody,
	deleteTranslation,
} from "./news-repository";

// Body fetching
export { getNewsBodyWithFetch, type BodyContent } from "./body-fetcher";

// AI translation
export { getOrCreateTranslation, type TranslationResult } from "./ai-translator";

// High-level composed operations
export {
	getNewsItemWithTranslation,
	type NewsDetailResult,
	type NewsDetailError,
} from "./news-detail";
