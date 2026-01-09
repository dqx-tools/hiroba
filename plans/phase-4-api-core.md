# Phase 4: API Core Routes & List Scraper

Set up the API with Hono, implement the async iterator list scraper, and add basic routes.

## Tasks

### 4.1 Set Up apps/api with Hono

**Dependencies**:
- `hono`
- `@hiroba/db` (workspace)
- `@hiroba/shared` (workspace)

**`apps/api/src/index.ts`**

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb, type Database } from "@hiroba/db";
import newsRoutes from "./routes/news";
import adminRoutes from "./routes/admin";

type Bindings = {
  DB: D1Database;
  ADMIN_API_KEY: string;
  AI_API_KEY: string;
};

type Variables = {
  db: Database;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("*", cors());

// Inject database into context
app.use("*", async (c, next) => {
  c.set("db", createDb(c.env.DB));
  await next();
});

app.route("/api/news", newsRoutes);
app.route("/api/admin", adminRoutes);

export default app;
```

### 4.2 Implement Async Iterator List Scraper

**`apps/api/src/lib/list-scraper.ts`**

```typescript
import { CATEGORY_MAP, SCRAPE_CONFIG, type Category } from "@hiroba/shared";
import type { ListItem } from "@hiroba/shared";

interface ScrapeOptions {
  fullScrape?: boolean;
}

/**
 * Async iterator that yields news items page by page.
 * Caller can break early when hitting known items (incremental mode).
 */
export async function* scrapeNewsList(
  category: Category,
  options: ScrapeOptions = {}
): AsyncGenerator<ListItem[], void, unknown> {
  let page = 1;

  while (true) {
    const items = await fetchListPage(category, page);

    if (items.length === 0) break;

    yield items;

    page++;
  }
}

async function fetchListPage(category: Category, page: number): Promise<ListItem[]> {
  const url = `${SCRAPE_CONFIG.baseUrl}${SCRAPE_CONFIG.newsListPath}?category=${category}&page=${page}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch list page: ${response.status}`);
  }

  const html = await response.text();
  return parseListPage(html, category);
}

function parseListPage(html: string, category: Category): ListItem[] {
  const items: ListItem[] = [];

  // Parse HTML to extract news items
  // Regex patterns based on existing scraper implementation
  const itemRegex = /detail\/([a-f0-9]{32})\//g;
  const titleRegex = /<[^>]+class="[^"]*news-title[^"]*"[^>]*>([^<]+)</g;
  const dateRegex = /(\d{4})\/(\d{1,2})\/(\d{1,2})/g;

  // ... parsing logic from existing scraper
  // Extract id, title_ja, published_at for each item

  return items;
}

/**
 * Scrape all categories incrementally.
 * Returns count of new items found.
 */
export async function scrapeAllCategories(
  db: Database,
  options: ScrapeOptions = {}
): Promise<{ category: Category; newItems: number }[]> {
  const results: { category: Category; newItems: number }[] = [];

  for (const category of CATEGORIES) {
    let newItems = 0;

    for await (const items of scrapeNewsList(category, options)) {
      const inserted = await upsertListItems(db, items);
      newItems += inserted.length;

      // In incremental mode, stop when we hit known items
      if (!options.fullScrape && inserted.length < items.length) {
        break;
      }
    }

    results.push({ category, newItems });
  }

  return results;
}
```

### 4.3 Implement Database Operations

**`apps/api/src/lib/news-repository.ts`**

```typescript
import { eq, desc, and, sql } from "drizzle-orm";
import { newsItems } from "@hiroba/db/schema";
import type { Database } from "@hiroba/db";
import type { ListItem, NewsItem, Category } from "@hiroba/shared";

export async function upsertListItems(
  db: Database,
  items: ListItem[]
): Promise<ListItem[]> {
  const now = Math.floor(Date.now() / 1000);
  const inserted: ListItem[] = [];

  for (const item of items) {
    const result = await db
      .insert(newsItems)
      .values({
        id: item.id,
        titleJa: item.titleJa,
        category: item.category,
        publishedAt: item.publishedAt,
        listCheckedAt: now,
      })
      .onConflictDoUpdate({
        target: newsItems.id,
        set: {
          listCheckedAt: now,
        },
      })
      .returning({ id: newsItems.id });

    // Track if this was a new insert vs update
    // (check if contentJa is null to determine if truly new)
    const existing = await db
      .select({ contentJa: newsItems.contentJa })
      .from(newsItems)
      .where(eq(newsItems.id, item.id))
      .get();

    if (existing?.contentJa === null) {
      inserted.push(item);
    }
  }

  return inserted;
}

export async function getNewsItems(
  db: Database,
  options: {
    category?: Category;
    limit?: number;
    cursor?: string;
  } = {}
): Promise<{ items: NewsItem[]; hasMore: boolean; nextCursor?: string }> {
  const limit = options.limit ?? 20;

  let query = db
    .select()
    .from(newsItems)
    .orderBy(desc(newsItems.publishedAt))
    .limit(limit + 1);

  if (options.category) {
    query = query.where(eq(newsItems.category, options.category));
  }

  if (options.cursor) {
    const cursorTime = parseInt(options.cursor, 10);
    query = query.where(sql`${newsItems.publishedAt} < ${cursorTime}`);
  }

  const results = await query.all();
  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, -1) : results;

  return {
    items,
    hasMore,
    nextCursor: hasMore ? String(items[items.length - 1].publishedAt) : undefined,
  };
}

export async function getNewsItem(
  db: Database,
  id: string
): Promise<NewsItem | null> {
  return db
    .select()
    .from(newsItems)
    .where(eq(newsItems.id, id))
    .get() ?? null;
}
```

### 4.4 Implement Public Routes

**`apps/api/src/routes/news.ts`**

```typescript
import { Hono } from "hono";
import { getNewsItems, getNewsItem } from "../lib/news-repository";
import type { Category } from "@hiroba/shared";

const app = new Hono();

// GET /api/news - List news items (metadata only)
app.get("/", async (c) => {
  const db = c.get("db");
  const category = c.req.query("category") as Category | undefined;
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const cursor = c.req.query("cursor");

  const result = await getNewsItems(db, { category, limit, cursor });

  return c.json(result);
});

// GET /api/news/:id - Get single news item (Japanese)
app.get("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  const item = await getNewsItem(db, id);

  if (!item) {
    return c.json({ error: "Not found" }, 404);
  }

  // Note: Body fetch will be added in Phase 5

  return c.json({ item });
});

export default app;
```

### 4.5 Implement Admin Routes (Basic)

**`apps/api/src/routes/admin.ts`**

```typescript
import { Hono } from "hono";
import { scrapeAllCategories } from "../lib/list-scraper";

const app = new Hono();

// Admin auth middleware
app.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const expectedKey = c.env.ADMIN_API_KEY;

  if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});

// POST /api/admin/scrape - Trigger list scrape
app.post("/scrape", async (c) => {
  const db = c.get("db");
  const fullScrape = c.req.query("full") === "true";

  const results = await scrapeAllCategories(db, { fullScrape });

  return c.json({
    success: true,
    results,
    totalNewItems: results.reduce((sum, r) => sum + r.newItems, 0),
  });
});

export default app;
```

### 4.6 Update wrangler.jsonc

```jsonc
{
  "name": "hiroba-api",
  "main": "src/index.ts",
  "compatibility_date": "2024-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "hiroba-db",
      "database_id": "YOUR_DATABASE_ID"
    }
  ]
}
```

## Files to Create/Modify

- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/wrangler.jsonc`
- `apps/api/src/index.ts`
- `apps/api/src/routes/news.ts`
- `apps/api/src/routes/admin.ts`
- `apps/api/src/lib/list-scraper.ts`
- `apps/api/src/lib/news-repository.ts`

## Commit

```
feat: add API with list scraper and basic news endpoints

- Set up Hono app with D1 database binding
- Implement async iterator list scraper for news pages
- Add GET /api/news endpoint with pagination and category filter
- Add GET /api/news/:id endpoint for single item
- Add POST /api/admin/scrape with API key auth
- Migrate and refactor existing scraper code
```

## Notes

- Body fetching (lazy load) will be added in Phase 5
- The `:lang` translation route will be added in Phase 5
- Existing scraper HTML parsing logic should be ported to `parseListPage()`
- Admin auth uses simple Bearer token for now
