# Phase 3: Shared Package

Create shared utilities, types, and constants used across all apps.

## Tasks

### 3.1 Set Up packages/shared

**Dependencies**:
- `zod` (for validation schemas)

### 3.2 Create Constants

**`packages/shared/src/constants.ts`**

```typescript
export const CATEGORIES = ["news", "event", "update", "maintenance"] as const;
export type Category = (typeof CATEGORIES)[number];

// Maps Japanese category names to English slugs
export const CATEGORY_MAP: Record<string, Category> = {
  "ニュース": "news",
  "イベント": "event",
  "アップデート": "update",
  "メンテナンス": "maintenance",
  "障害": "maintenance",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  news: "News",
  event: "Events",
  update: "Updates",
  maintenance: "Maintenance",
};

// Scraping configuration
export const SCRAPE_CONFIG = {
  baseUrl: "https://hiroba.dqx.jp",
  newsListPath: "/sc/news/",
  newsDetailPath: "/sc/news/detail/",
  topicsDetailPath: "/sc/topics/detail/",
} as const;

// Concurrency lock thresholds (in seconds)
export const LOCK_CONFIG = {
  bodyFetchStaleThreshold: 30,
  bodyFetchMaxWait: 15,
  bodyFetchPollInterval: 500,
  translationStaleThreshold: 60,
  translationMaxWait: 30,
  translationPollInterval: 500,
} as const;
```

### 3.3 Create Types

**`packages/shared/src/types.ts`**

```typescript
import type { Category } from "./constants";

// List scraper output (Phase 1)
export interface ListItem {
  id: string;
  titleJa: string;
  category: Category;
  publishedAt: number;
}

// Full news item from database
export interface NewsItem {
  id: string;
  titleJa: string;
  category: Category;
  publishedAt: number;
  listCheckedAt: number;
  contentJa: string | null;
  sourceUpdatedAt: number | null;
  bodyFetchedAt: number | null;
}

// Translation record
export interface Translation {
  itemType: "news" | "topic";
  itemId: string;
  language: string;
  title: string;
  content: string;
  translatedAt: number;
}

// Glossary entry
export interface GlossaryEntry {
  sourceText: string;
  targetLanguage: string;
  translatedText: string;
  updatedAt: number;
}

// API response types
export interface NewsListResponse {
  items: NewsItem[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface NewsDetailResponse {
  item: NewsItem;
  translation?: Translation;
}

// Admin types
export interface StatsResponse {
  totalItems: number;
  itemsWithBody: number;
  itemsTranslated: number;
  itemsPendingRecheck: number;
}

export interface RecheckQueueItem {
  id: string;
  titleJa: string;
  category: Category;
  publishedAt: number;
  bodyFetchedAt: number | null;
  nextCheckAt: number;
}
```

### 3.4 Create Freshness Helpers

**`packages/shared/src/freshness.ts`**

```typescript
/**
 * Calculate when an article's body should next be rechecked.
 *
 * Formula: interval_hours = clamp(age_in_hours / 24, min=1, max=168)
 *
 * This means:
 * - 1-day-old article → recheck every 1 hour
 * - 1-week-old article → recheck every 7 hours
 * - 1-month+ old article → recheck weekly (168 hours max)
 */
export function getNextCheckTime(publishedAt: number, bodyFetchedAt: number): number {
  const now = Date.now();
  const ageMs = now - publishedAt * 1000;
  const ageHours = ageMs / (1000 * 60 * 60);

  const intervalHours = Math.max(1, Math.min(168, ageHours / 24));
  const intervalMs = intervalHours * 60 * 60 * 1000;

  return bodyFetchedAt * 1000 + intervalMs;
}

/**
 * Check if an article's body is due for a recheck.
 */
export function isDueForCheck(publishedAt: number, bodyFetchedAt: number | null): boolean {
  if (bodyFetchedAt === null) return true;

  const nextCheck = getNextCheckTime(publishedAt, bodyFetchedAt);
  return Date.now() >= nextCheck;
}

/**
 * Check if a translation is stale (source was updated after translation).
 */
export function isTranslationStale(
  sourceUpdatedAt: number | null,
  translatedAt: number
): boolean {
  if (sourceUpdatedAt === null) return false;
  return sourceUpdatedAt > translatedAt;
}

/**
 * Get human-readable time until next check.
 */
export function getTimeUntilCheck(publishedAt: number, bodyFetchedAt: number): string {
  const nextCheck = getNextCheckTime(publishedAt, bodyFetchedAt);
  const diff = nextCheck - Date.now();

  if (diff <= 0) return "now";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
```

### 3.5 Create Index Export

**`packages/shared/src/index.ts`**

```typescript
export * from "./constants";
export * from "./types";
export * from "./freshness";
```

## Files to Create/Modify

- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/shared/src/index.ts`
- `packages/shared/src/constants.ts`
- `packages/shared/src/types.ts`
- `packages/shared/src/freshness.ts`

## Commit

```
feat: add shared package with types, constants, and freshness helpers

- Define category constants and mappings
- Add TypeScript types for news items, translations, and API responses
- Implement age-based freshness calculation for body rechecks
- Add staleness detection helper for translations
```

## Notes

- All timestamps in types are Unix timestamps (seconds)
- Freshness helpers use milliseconds internally but accept/return seconds for DB compatibility
- The `LOCK_CONFIG` constants will be used by the API for concurrency control
- Zod schemas can be added later for runtime validation if needed
