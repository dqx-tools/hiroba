# Phase 2: Database Schema

Define all database tables with Drizzle ORM.

## Tasks

### 2.1 Set Up packages/db

**Dependencies**:
- `drizzle-orm`
- `drizzle-kit` (dev)
- `@cloudflare/workers-types` (dev)

**Exports**:
- `.` → client factory and types
- `./schema` → all schema tables

### 2.2 Create Schema Files

**`packages/db/src/schema/news-items.ts`**

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const newsItems = sqliteTable("news_items", {
  id: text("id").primaryKey(),                          // 32-char hex
  titleJa: text("title_ja").notNull(),                  // From list page
  category: text("category").notNull(),                 // news|event|update|maintenance
  publishedAt: integer("published_at").notNull(),       // Unix timestamp
  listCheckedAt: integer("list_checked_at").notNull(),  // Last seen in list scrape
  contentJa: text("content_ja"),                        // From detail page, NULL if not fetched
  sourceUpdatedAt: integer("source_updated_at"),        // From detail page
  bodyFetchedAt: integer("body_fetched_at"),            // When detail page was fetched
  bodyFetchingSince: integer("body_fetching_since"),    // Concurrency lock
});
```

**`packages/db/src/schema/translations.ts`**

```typescript
import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const translations = sqliteTable("translations", {
  itemType: text("item_type").notNull(),                // "news" or "topic"
  itemId: text("item_id").notNull(),                    // FK to news_items or topics
  language: text("language").notNull(),                 // e.g., "en"
  title: text("title").notNull(),
  content: text("content").notNull(),
  translatedAt: integer("translated_at").notNull(),     // When translation completed
  translatingSince: integer("translating_since"),       // Concurrency lock
}, (table) => ({
  pk: primaryKey({ columns: [table.itemType, table.itemId, table.language] }),
}));
```

**`packages/db/src/schema/glossary.ts`**

```typescript
import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const glossary = sqliteTable("glossary", {
  sourceText: text("source_text").notNull(),            // Japanese term
  targetLanguage: text("target_language").notNull(),    // e.g., "en"
  translatedText: text("translated_text").notNull(),    // Preferred translation
  updatedAt: integer("updated_at").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.sourceText, table.targetLanguage] }),
}));
```

**`packages/db/src/schema/index.ts`**

```typescript
export * from "./news-items";
export * from "./translations";
export * from "./glossary";
```

### 2.3 Create Client Factory

**`packages/db/src/client.ts`**

```typescript
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;
```

**`packages/db/src/index.ts`**

```typescript
export { createDb, type Database } from "./client";
export * from "./schema";
```

### 2.4 Configure Drizzle Kit

**`packages/db/drizzle.config.ts`**

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "../../migrations",
  dialect: "sqlite",
});
```

### 2.5 Generate and Test Migration

```bash
# Generate migration
pnpm db:generate

# Apply to local D1
pnpm db:migrate:local

# Verify tables exist
wrangler d1 execute hiroba-db --local --command "SELECT name FROM sqlite_master WHERE type='table'"
```

## Files to Create/Modify

- `packages/db/package.json`
- `packages/db/tsconfig.json`
- `packages/db/drizzle.config.ts`
- `packages/db/src/index.ts`
- `packages/db/src/client.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/src/schema/news-items.ts`
- `packages/db/src/schema/translations.ts`
- `packages/db/src/schema/glossary.ts`
- `migrations/0001_initial.sql` (generated)

## Commit

```
feat: add drizzle schema for news_items, translations, and glossary

- Define news_items table with two-phase scraping columns
- Define translations table with composite primary key
- Define glossary table for term mappings
- Add createDb client factory
- Generate initial D1 migration
```

## Notes

- `topics` table is deferred for future implementation
- All timestamps are Unix timestamps (INTEGER)
- NULL values in `contentJa`, `bodyFetchedAt` etc. indicate body not yet fetched
- Concurrency lock columns (`bodyFetchingSince`, `translatingSince`) enable single-flight pattern
