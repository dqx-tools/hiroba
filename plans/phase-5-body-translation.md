# Phase 5: Body Fetching & Translation

Implement lazy body fetching with concurrency control and AI translation.

## Tasks

### 5.1 Implement Body Scraper

**`apps/api/src/lib/body-scraper.ts`**

```typescript
import { SCRAPE_CONFIG } from "@hiroba/shared";

export interface BodyContent {
  contentJa: string;
  sourceUpdatedAt: number;
}

/**
 * Fetch and parse the detail page for a news item.
 */
export async function fetchNewsBody(id: string): Promise<BodyContent> {
  const url = `${SCRAPE_CONFIG.baseUrl}${SCRAPE_CONFIG.newsDetailPath}${id}/`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch detail page: ${response.status}`);
  }

  const html = await response.text();
  return parseDetailPage(html);
}

function parseDetailPage(html: string): BodyContent {
  // Extract content from detail page
  // Parse the news body content
  // Extract source_updated_at from page metadata

  // ... parsing logic based on existing scraper

  return {
    contentJa: extractedContent,
    sourceUpdatedAt: extractedTimestamp,
  };
}
```

### 5.2 Implement Body Fetch with Concurrency Lock

**`apps/api/src/lib/body-fetcher.ts`**

```typescript
import { eq, and, or, lt, isNull, sql } from "drizzle-orm";
import { newsItems } from "@hiroba/db/schema";
import type { Database } from "@hiroba/db";
import { LOCK_CONFIG } from "@hiroba/shared";
import { fetchNewsBody } from "./body-scraper";

/**
 * Get news body, fetching from source if needed.
 * Uses single-flight pattern to prevent concurrent fetches.
 */
export async function getNewsBodyWithFetch(
  db: Database,
  id: string
): Promise<{ contentJa: string; sourceUpdatedAt: number } | null> {
  const item = await db
    .select()
    .from(newsItems)
    .where(eq(newsItems.id, id))
    .get();

  if (!item) return null;

  // If body exists and is fresh, return it
  if (item.contentJa !== null) {
    return {
      contentJa: item.contentJa,
      sourceUpdatedAt: item.sourceUpdatedAt!,
    };
  }

  // Try to claim the lock
  const now = Math.floor(Date.now() / 1000);
  const staleThreshold = now - LOCK_CONFIG.bodyFetchStaleThreshold;

  const claimed = await db
    .update(newsItems)
    .set({ bodyFetchingSince: now })
    .where(
      and(
        eq(newsItems.id, id),
        or(
          isNull(newsItems.bodyFetchingSince),
          lt(newsItems.bodyFetchingSince, staleThreshold)
        )
      )
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

async function pollForBody(
  db: Database,
  id: string
): Promise<{ contentJa: string; sourceUpdatedAt: number } | null> {
  const maxWait = LOCK_CONFIG.bodyFetchMaxWait * 1000;
  const pollInterval = LOCK_CONFIG.bodyFetchPollInterval;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    await sleep(pollInterval);

    const item = await db
      .select({
        contentJa: newsItems.contentJa,
        sourceUpdatedAt: newsItems.sourceUpdatedAt,
      })
      .from(newsItems)
      .where(eq(newsItems.id, id))
      .get();

    if (item?.contentJa !== null) {
      return {
        contentJa: item.contentJa,
        sourceUpdatedAt: item.sourceUpdatedAt!,
      };
    }
  }

  throw new Error("Timeout waiting for body fetch");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### 5.3 Implement Translation with Concurrency Lock

**`apps/api/src/lib/translator.ts`**

```typescript
import { eq, and, or, lt, isNull } from "drizzle-orm";
import { translations, glossary } from "@hiroba/db/schema";
import type { Database } from "@hiroba/db";
import { LOCK_CONFIG, isTranslationStale } from "@hiroba/shared";

interface TranslationResult {
  title: string;
  content: string;
  translatedAt: number;
}

/**
 * Get or create translation for a news item.
 * Uses single-flight pattern to prevent concurrent translations.
 */
export async function getOrCreateTranslation(
  db: Database,
  itemId: string,
  itemType: "news" | "topic",
  language: string,
  sourceTitle: string,
  sourceContent: string,
  sourceUpdatedAt: number,
  aiApiKey: string
): Promise<TranslationResult> {
  // Check for existing translation
  const existing = await db
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.itemType, itemType),
        eq(translations.itemId, itemId),
        eq(translations.language, language)
      )
    )
    .get();

  // If exists and not stale, return it
  if (existing && !isTranslationStale(sourceUpdatedAt, existing.translatedAt)) {
    return {
      title: existing.title,
      content: existing.content,
      translatedAt: existing.translatedAt,
    };
  }

  // Try to claim the lock
  const now = Math.floor(Date.now() / 1000);
  const staleThreshold = now - LOCK_CONFIG.translationStaleThreshold;

  // Upsert with lock claim
  const claimed = await tryClaimTranslationLock(
    db, itemId, itemType, language, now, staleThreshold
  );

  if (claimed) {
    try {
      // Fetch glossary for this language
      const glossaryEntries = await db
        .select()
        .from(glossary)
        .where(eq(glossary.targetLanguage, language))
        .all();

      // Do AI translation
      const translated = await translateWithAI(
        sourceTitle,
        sourceContent,
        language,
        glossaryEntries,
        aiApiKey
      );

      // Save translation
      await db
        .insert(translations)
        .values({
          itemType,
          itemId,
          language,
          title: translated.title,
          content: translated.content,
          translatedAt: now,
          translatingSince: null,
        })
        .onConflictDoUpdate({
          target: [translations.itemType, translations.itemId, translations.language],
          set: {
            title: translated.title,
            content: translated.content,
            translatedAt: now,
            translatingSince: null,
          },
        });

      return { ...translated, translatedAt: now };
    } catch (error) {
      // Release lock on error
      await releaseTranslationLock(db, itemId, itemType, language);
      throw error;
    }
  }

  // Someone else is translating, poll until done
  return pollForTranslation(db, itemId, itemType, language);
}

async function translateWithAI(
  title: string,
  content: string,
  targetLanguage: string,
  glossaryEntries: { sourceText: string; translatedText: string }[],
  apiKey: string
): Promise<{ title: string; content: string }> {
  // Build glossary context
  const glossaryContext = glossaryEntries.length > 0
    ? `\n\nGlossary (use these exact translations):\n${
        glossaryEntries.map(e => `- ${e.sourceText} → ${e.translatedText}`).join("\n")
      }`
    : "";

  // Call AI API (Claude, etc.)
  const prompt = `Translate the following Japanese news article to ${targetLanguage}.
Preserve formatting and line breaks.
${glossaryContext}

Title: ${title}

Content:
${content}`;

  // ... AI API call implementation
  // Return { title, content }
}
```

### 5.4 Update News Routes

**`apps/api/src/routes/news.ts`** (additions)

```typescript
import { getNewsBodyWithFetch } from "../lib/body-fetcher";
import { getOrCreateTranslation } from "../lib/translator";

// GET /api/news/:id - Now triggers body fetch
app.get("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  const item = await getNewsItem(db, id);
  if (!item) {
    return c.json({ error: "Not found" }, 404);
  }

  // Trigger lazy body fetch if needed
  if (item.contentJa === null) {
    const body = await getNewsBodyWithFetch(db, id);
    if (body) {
      item.contentJa = body.contentJa;
      item.sourceUpdatedAt = body.sourceUpdatedAt;
    }
  }

  return c.json({ item });
});

// GET /api/news/:id/:lang - Get translated version
app.get("/:id/:lang", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const lang = c.req.param("lang");

  const item = await getNewsItem(db, id);
  if (!item) {
    return c.json({ error: "Not found" }, 404);
  }

  // Ensure body is fetched
  if (item.contentJa === null) {
    const body = await getNewsBodyWithFetch(db, id);
    if (body) {
      item.contentJa = body.contentJa;
      item.sourceUpdatedAt = body.sourceUpdatedAt;
    }
  }

  if (!item.contentJa) {
    return c.json({ error: "Content not available" }, 500);
  }

  // Get or create translation
  const translation = await getOrCreateTranslation(
    db,
    id,
    "news",
    lang,
    item.titleJa,
    item.contentJa,
    item.sourceUpdatedAt!,
    c.env.AI_API_KEY
  );

  return c.json({ item, translation });
});
```

### 5.5 Add Staleness Detection

The `isTranslationStale()` helper from `@hiroba/shared` checks if `sourceUpdatedAt > translatedAt`. This is used in `getOrCreateTranslation()` to determine if a re-translation is needed.

## Files to Create/Modify

- `apps/api/src/lib/body-scraper.ts`
- `apps/api/src/lib/body-fetcher.ts`
- `apps/api/src/lib/translator.ts`
- `apps/api/src/routes/news.ts` (update)

## Commit

```
feat: add lazy body fetching and translation with concurrency control

- Implement body scraper for detail pages
- Add single-flight pattern for body fetch with body_fetching_since lock
- Implement AI translation with glossary support
- Add single-flight pattern for translation with translating_since lock
- Add GET /api/news/:id/:lang endpoint for translated content
- Detect stale translations via source_updated_at comparison
```

## Notes

- Concurrency locks prevent duplicate AI calls in serverless environment
- Polling with timeout handles the case when another worker is fetching/translating
- Glossary entries are fetched per-translation to ensure consistency
- AI API implementation details depend on which provider is used (Claude, OpenAI, etc.)
- Port existing translator.ts AI logic to the new structure
