# Phase 6: Admin Endpoints & Cron Job

Complete the admin API and implement scheduled scraping.

## Tasks

### 6.1 Implement Stats Endpoint

**`apps/api/src/routes/admin.ts`** (additions)

```typescript
import { sql, eq, isNull, isNotNull, and, lt } from "drizzle-orm";
import { newsItems, translations } from "@hiroba/db/schema";
import { isDueForCheck } from "@hiroba/shared";

// GET /api/admin/stats
app.get("/stats", async (c) => {
  const db = c.get("db");

  const [
    totalItems,
    itemsWithBody,
    translatedItems,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(newsItems).get(),
    db.select({ count: sql<number>`count(*)` }).from(newsItems)
      .where(isNotNull(newsItems.contentJa)).get(),
    db.select({ count: sql<number>`count(DISTINCT item_id)` })
      .from(translations)
      .where(eq(translations.itemType, "news")).get(),
  ]);

  // Count items due for recheck
  const allItems = await db
    .select({
      publishedAt: newsItems.publishedAt,
      bodyFetchedAt: newsItems.bodyFetchedAt,
    })
    .from(newsItems)
    .where(isNotNull(newsItems.bodyFetchedAt))
    .all();

  const itemsPendingRecheck = allItems.filter(
    item => isDueForCheck(item.publishedAt, item.bodyFetchedAt)
  ).length;

  return c.json({
    totalItems: totalItems?.count ?? 0,
    itemsWithBody: itemsWithBody?.count ?? 0,
    itemsTranslated: translatedItems?.count ?? 0,
    itemsPendingRecheck,
  });
});
```

### 6.2 Implement Recheck Queue Endpoint

```typescript
import { getNextCheckTime } from "@hiroba/shared";

// GET /api/admin/recheck-queue
app.get("/recheck-queue", async (c) => {
  const db = c.get("db");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  const items = await db
    .select()
    .from(newsItems)
    .where(isNotNull(newsItems.bodyFetchedAt))
    .all();

  // Calculate next check time and filter/sort
  const queue = items
    .map(item => ({
      id: item.id,
      titleJa: item.titleJa,
      category: item.category,
      publishedAt: item.publishedAt,
      bodyFetchedAt: item.bodyFetchedAt,
      nextCheckAt: getNextCheckTime(item.publishedAt, item.bodyFetchedAt!),
    }))
    .filter(item => item.nextCheckAt <= Date.now())
    .sort((a, b) => a.nextCheckAt - b.nextCheckAt)
    .slice(0, limit);

  return c.json({ items: queue });
});
```

### 6.3 Implement Invalidation Endpoints

```typescript
// DELETE /api/news/:id/body - Invalidate cached body
app.delete("/news/:id/body", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  const result = await db
    .update(newsItems)
    .set({
      contentJa: null,
      sourceUpdatedAt: null,
      bodyFetchedAt: null,
      bodyFetchingSince: null,
    })
    .where(eq(newsItems.id, id))
    .returning({ id: newsItems.id });

  if (result.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true, id });
});

// DELETE /api/news/:id/:lang - Delete translation
app.delete("/news/:id/:lang", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const lang = c.req.param("lang");

  const result = await db
    .delete(translations)
    .where(
      and(
        eq(translations.itemType, "news"),
        eq(translations.itemId, id),
        eq(translations.language, lang)
      )
    )
    .returning({ itemId: translations.itemId });

  if (result.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true, id, language: lang });
});
```

### 6.4 Implement Glossary Endpoints

```typescript
import { glossary } from "@hiroba/db/schema";

// GET /api/glossary
app.get("/glossary", async (c) => {
  const db = c.get("db");
  const lang = c.req.query("lang");

  let query = db.select().from(glossary);

  if (lang) {
    query = query.where(eq(glossary.targetLanguage, lang));
  }

  const entries = await query.all();
  return c.json({ entries });
});

// POST /api/glossary/import - CSV import
app.post("/glossary/import", async (c) => {
  const db = c.get("db");
  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  const targetLanguage = formData.get("targetLanguage") as string;

  if (!file || !targetLanguage) {
    return c.json({ error: "Missing file or targetLanguage" }, 400);
  }

  const csv = await file.text();
  const lines = csv.split("\n").filter(line => line.trim());
  const now = Math.floor(Date.now() / 1000);

  let imported = 0;
  for (const line of lines) {
    const [sourceText, translatedText] = line.split(",").map(s => s.trim());
    if (!sourceText || !translatedText) continue;

    await db
      .insert(glossary)
      .values({
        sourceText,
        targetLanguage,
        translatedText,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [glossary.sourceText, glossary.targetLanguage],
        set: {
          translatedText,
          updatedAt: now,
        },
      });

    imported++;
  }

  return c.json({ success: true, imported });
});

// DELETE /api/glossary/:sourceText/:lang
app.delete("/glossary/:sourceText/:lang", async (c) => {
  const db = c.get("db");
  const sourceText = decodeURIComponent(c.req.param("sourceText"));
  const lang = c.req.param("lang");

  const result = await db
    .delete(glossary)
    .where(
      and(
        eq(glossary.sourceText, sourceText),
        eq(glossary.targetLanguage, lang)
      )
    )
    .returning({ sourceText: glossary.sourceText });

  if (result.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});
```

### 6.5 Implement Cron Job

**`apps/api/src/index.ts`** (add scheduled handler)

```typescript
import { scrapeAllCategories } from "./lib/list-scraper";

export default {
  fetch: app.fetch,

  async scheduled(
    event: ScheduledEvent,
    env: Bindings,
    ctx: ExecutionContext
  ) {
    const db = createDb(env.DB);

    console.log("Starting scheduled scrape...");

    try {
      const results = await scrapeAllCategories(db, { fullScrape: false });
      const totalNew = results.reduce((sum, r) => sum + r.newItems, 0);

      console.log(`Scrape complete: ${totalNew} new items`);
      console.log(results);

      // Call publishUpdate hook for new items (no-op for now)
      if (totalNew > 0) {
        await publishUpdate({
          topic: "/api/feed/news",
          contentType: "application/json",
          content: JSON.stringify({ newItems: totalNew }),
        });
      }
    } catch (error) {
      console.error("Scrape failed:", error);
    }
  },
};
```

### 6.6 Add publishUpdate Stub

**`apps/api/src/lib/pubsub.ts`**

```typescript
export interface WebSubEvent {
  topic: string;
  contentType: string;
  content: string;
}

/**
 * Publish an update event.
 * Currently a no-op that logs the event.
 * Full WebSub hub implementation deferred.
 */
export async function publishUpdate(event: WebSubEvent): Promise<void> {
  console.log("[WebSub] Event:", event.topic);
  // TODO: Implement full WebSub hub
  // - Store subscriptions in websub_subscriptions table
  // - POST to all active subscribers
  // - Use Cloudflare Queues for reliable delivery
}
```

### 6.7 Configure Cron Trigger

**`apps/api/wrangler.jsonc`** (add triggers)

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
  ],
  "triggers": {
    "crons": ["*/15 * * * *"]
  }
}
```

## Files to Create/Modify

- `apps/api/src/routes/admin.ts` (update with all endpoints)
- `apps/api/src/index.ts` (add scheduled handler)
- `apps/api/src/lib/pubsub.ts` (new)
- `apps/api/wrangler.jsonc` (add cron triggers)

## Commit

```
feat: add admin endpoints and scheduled cron job

- Add GET /api/admin/stats for item counts
- Add GET /api/admin/recheck-queue for items due for body recheck
- Add DELETE /api/news/:id/body to invalidate cached body
- Add DELETE /api/news/:id/:lang to delete translation
- Add glossary CRUD endpoints (list, import CSV, delete)
- Implement scheduled handler for incremental list scraping
- Add publishUpdate stub for future WebSub integration
- Configure 15-minute cron trigger
```

## Notes

- Cron runs every 15 minutes for incremental scraping
- Full scrape can be triggered manually via `POST /api/admin/scrape?full=true`
- `publishUpdate()` is a hook point for future WebSub implementation
- Recheck queue is calculated in-memory; for large datasets, consider a scheduled job to pre-compute
