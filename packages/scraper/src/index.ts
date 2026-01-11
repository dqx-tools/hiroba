/**
 * Scraper package - list scraping and glossary fetching.
 *
 * Used by the cron worker and admin app for scraping news lists
 * and importing glossary data.
 */

// List scraper
export {
	scrapeNewsList,
	scrapeCategory,
	parseListPage,
	getAllCategories,
	CATEGORY_TO_ID,
} from "./list-scraper";

// Body scraper
export { fetchNewsBody, type BodyContent } from "./body-scraper";

// Glossary fetcher
export {
	fetchGlossary,
	GLOSSARY_URL,
	type GlossaryEntry,
} from "./glossary-fetcher";
