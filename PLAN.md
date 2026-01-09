# Japanese News Translation App — Implementation Plan

## Overview

Scrapes Japanese news articles from DQX Hiroba, translates them to English using AI, and serves them via a public web frontend. An admin panel provides visibility into the recheck queue, glossary management, and translation invalidation.

**Source**: `https://hiroba.dqx.jp/sc/news/detail/{id}/` (and `/sc/topics/detail/{id}/` for future topics)

## Stack & Constraints

All apps deploy to **Cloudflare**:

| App | Platform | Runtime |
|-----|----------|---------|
| API | Cloudflare Workers | Hono + Drizzle |
| Web (public) | Cloudflare Pages | Astro SSR (`output: "server"`) |
| Admin (internal) | Cloudflare Pages | Astro static + React islands |
| Database | Cloudflare D1 | SQLite, `drizzle-orm/d1` adapter |

- **Monorepo**: pnpm workspaces + Turborepo (see ARCHITECTURE.md for setup)
- **Package manager**: pnpm

---

## Two-Phase Scraping Model

Scraping is split into two phases to minimize unnecessary work:

### Phase 1: List Scraping (metadata only)
- Fetches the paginated news list for each category
- Extracts: `id`, `title_ja`, `category`, `published_at`
- Exposed as an **async iterator** yielding items per page
- Stops when it encounters an already-known item (incremental mode)
- Can be forced to continue through all pages (full scrape mode)

### Phase 2: Body Scraping (on-demand)
- Fetches the detail page for a specific article
- Extracts: `content_ja`, `source_updated_at`
- Triggered lazily on first request for article content
- Also triggered when translation is requested

This separation means new articles appear in listings immediately after Phase 1, while body content and translations are fetched only when needed.

---

## Database Schema

### `news_items`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | 32-char hex, e.g. `1d8c9f71eaa6923fc9d3cd5d10aea4ce` |
| title_ja | TEXT | From list page (Phase 1) |
| category | TEXT | `news`, `event`, `update`, or `maintenance` |
| published_at | INTEGER (timestamp) | From list page (Phase 1) |
| list_checked_at | INTEGER (timestamp) | When we last saw this in a list scrape |
| content_ja | TEXT NULL | From detail page (Phase 2), NULL if not yet fetched |
| source_updated_at | INTEGER (timestamp) NULL | From detail page, NULL if not yet fetched |
| body_fetched_at | INTEGER (timestamp) NULL | When we last fetched the detail page |
| body_fetching_since | INTEGER (timestamp) NULL | Concurrency lock for body fetch |

**Category mapping** (upstream → stored):
- ニュース → `news`
- イベント → `event`
- アップデート → `update`
- メンテナンス / 障害 → `maintenance`

### `topics` (future)
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | 32-char hex, same format as news |
| title_ja | TEXT | |
| published_at | INTEGER (timestamp) | |
| list_checked_at | INTEGER (timestamp) | |
| content_html_ja | TEXT NULL | Rich text / HTML content |
| source_updated_at | INTEGER (timestamp) NULL | |
| body_fetched_at | INTEGER (timestamp) NULL | |
| body_fetching_since | INTEGER (timestamp) NULL | Concurrency lock for body fetch |

Source URL: `https://hiroba.dqx.jp/sc/topics/detail/{id}/`

### `translations`
| Column | Type | Notes |
|--------|------|-------|
| item_type | TEXT | `news` or `topic` |
| item_id | TEXT | FK to news_items.id or topics.id |
| language | TEXT | e.g., `en` |
| title | TEXT | |
| content | TEXT | |
| translated_at | INTEGER (timestamp) | When translation completed |
| translating_since | INTEGER (timestamp) NULL | Concurrency lock (see below) |
| **PK** | (item_type, item_id, language) | |

### `glossary`
| Column | Type | Notes |
|--------|------|-------|
| source_text | TEXT | Japanese term |
| target_language | TEXT | e.g., `en` |
| translated_text | TEXT | Preferred translation |
| updated_at | INTEGER (timestamp) | |
| **PK** | (source_text, target_language) | |

---

## Key Patterns

### List Scraper as Async Iterator

The list scraper yields items page-by-page:

```typescript
interface ListItem {
  id: string;
  title_ja: string;
  category: Category;
  published_at: number;
}

async function* scrapeNewsList(
  category: Category,
  options?: { fullScrape?: boolean }
): AsyncGenerator<ListItem[], void, unknown> {
  let page = 1;
  while (true) {
    const items = await fetchListPage(category, page);
    if (items.length === 0) break;
    
    yield items;
    
    // In incremental mode, caller can break early when hitting known items
    page++;
  }
}
```

The cron job / API endpoint consumes this iterator and stops when appropriate:
- **Incremental**: Stop when `id` already exists in database
- **Full scrape**: Continue through all pages

### Lazy Body Fetching

When a request needs article content:

1. Check if `content_ja IS NOT NULL` and `body_fetched_at` is fresh enough
2. If not, fetch detail page and update `content_ja`, `source_updated_at`, `body_fetched_at`
3. Return content (and trigger translation if requested language ≠ `ja`)

Put the logic in `packages/shared/src/scraping.ts` or the API's lib folder.

### Body Fetch Concurrency (single-flight pattern)

Similar to translation concurrency, prevent multiple concurrent fetches of the same article's body. Use `body_fetching_since` as a lock:

1. Check if body exists and is fresh → return it
2. Try to claim: `UPDATE ... SET body_fetching_since = now() WHERE body_fetching_since IS NULL OR body_fetching_since < stale_threshold`
3. If claimed (changes > 0) → fetch detail page → update `content_ja`, `source_updated_at`, `body_fetched_at`, clear `body_fetching_since`
4. If not claimed → poll until `body_fetched_at` is updated (someone else is fetching)

Stale threshold: 30 seconds. Max wait: 15 seconds with 500ms polling.

### Age-Based Freshness (for body recheck)

Derive recheck interval from article age:

```
interval_hours = clamp(age_in_hours / 24, min=1, max=168)
next_check = body_fetched_at + interval_hours
```

This means:
- 1-day-old article → recheck body every 1 hour
- 1-week-old article → recheck body every 7 hours
- 1-month+ old article → recheck weekly (capped)

Put helpers in `packages/shared/src/freshness.ts`: `getNextCheckTime(publishedAt, bodyFetchedAt)` and `isDueForCheck(publishedAt, bodyFetchedAt)`.

### Translation Concurrency (single-flight pattern)

Multiple requests for the same translation should not trigger multiple AI calls. Use `translating_since` as a lock:

1. Check if completed translation exists and is not stale → return it
2. Try to claim: `UPDATE ... SET translating_since = now() WHERE translating_since IS NULL OR translating_since < stale_threshold`
3. If claimed (changes > 0) → fetch body if needed → do AI translation → set `translated_at`, clear `translating_since`
4. If not claimed → poll until `translated_at` is set (someone else is working)

Stale threshold: 60 seconds. Max wait: 30 seconds with 500ms polling.

### Staleness Detection

A translation is stale if `news_items.source_updated_at > translations.translated_at`. No hash needed.

### Glossary Import

Simple UPSERT from CSV. Format: `japanese_text,english_text`. Use `ON CONFLICT DO UPDATE` for each row. Safe to run repeatedly.

---

## API Endpoints

### Public
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/news` | List news items (paginated, optional `category` filter). Returns metadata only. |
| GET | `/api/news/:id` | Get news item in Japanese. Triggers body fetch if needed. |
| GET | `/api/news/:id/:lang` | Get news item in specified language. Triggers body fetch + translation if needed. |

### Admin

**Protection**: Admin endpoints require authentication. Options:
- **API key**: Check `Authorization: Bearer <key>` header against `ADMIN_API_KEY` secret
- **Cloudflare Access service token**: Validate `CF-Access-Client-Id` header
- **Proxy through admin app**: Admin Pages app (protected by Access) forwards requests to API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/stats` | Counts: total items, translated, pending body fetch, etc. |
| POST | `/api/admin/scrape` | Trigger list scrape. Query: `?full=true` for full scrape. |
| GET | `/api/admin/recheck-queue` | Items due for body recheck, sorted by next check time |
| DELETE | `/api/news/:id/body` | Invalidate cached body (re-fetched lazily on next request) |
| DELETE | `/api/news/:id/:lang` | Delete translation for item + language |
| GET | `/api/glossary` | List all glossary entries |
| POST | `/api/glossary/import` | Multipart form: file + targetLanguage |
| DELETE | `/api/glossary/:sourceText/:lang` | Delete single entry |

---

## Events (WebSub / PubSubHubbub)

Design goal: allow external services to subscribe to content updates using the WebSub protocol (formerly PubSubHubbub).

### Hub Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/hub` | Hub endpoint for subscribe/unsubscribe requests |
| GET | `/api/hub` | Verification callback (hub.mode, hub.topic, hub.challenge) |

### Topics (Feed URLs)

| Topic URL | Events |
|-----------|--------|
| `/api/feed/news` | New articles, updated articles |
| `/api/feed/news/:category` | Category-specific feed |
| `/api/feed/translations/:lang` | New/updated translations for language |

### Internal Interface

```typescript
interface WebSubEvent {
  topic: string;          // e.g., "/api/feed/news"
  contentType: string;    // e.g., "application/atom+xml"
  content: string;        // The feed content to distribute
}

// Called after state changes
async function publishUpdate(event: WebSubEvent): Promise<void>;
```

### Implementation Notes

- Store subscriptions in a `websub_subscriptions` table (callback URL, topic, lease, secret)
- On content change, POST to all active subscribers for that topic
- Use Cloudflare Queues for reliable delivery with retries
- Support both Atom and JSON feed formats
- Implement subscriber verification (sync or async)

### Deferred

For initial implementation, `publishUpdate()` can be a no-op that logs events. The full WebSub hub can be added later. The important thing is that all state changes call this function so the hook point exists.

---

## Cron Job

A scheduled Worker (or cron trigger) runs the list scraper periodically:

```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const db = createDb(env.DB);
    
    for (const category of CATEGORIES) {
      for await (const items of scrapeNewsList(category)) {
        const newItems = await upsertListItems(db, items);
        
        // Stop if we hit items we've already seen (incremental mode)
        if (newItems.length === 0) break;
      }
    }
  }
};
```

Configure in `wrangler.jsonc`:

```jsonc
{
  "triggers": {
    "crons": ["*/15 * * * *"]  // Every 15 minutes
  }
}
```

---

## Pages

### Web (public, SSR via Cloudflare Pages)
| Path | Description |
|------|-------------|
| `/` | Latest news, grouped by category |
| `/news/[id]` | News detail (fetches English translation) |
| `/category/[slug]` | News filtered by category |

### Admin (static + React islands via Cloudflare Pages)
| Path | Description |
|------|-------------|
| `/` | Dashboard with stats |
| `/news` | News list with "Scrape Now" and "Full Scrape" buttons |
| `/news/[id]` | News detail with invalidate body / translation buttons |
| `/recheck-queue` | Items due for body recheck, with invalidate buttons |
| `/glossary` | Glossary entries list with delete buttons |
| `/glossary/import` | CSV upload form |

Admin pages render static HTML with React components using `client:load`. Components fetch data from API on mount. Protected by Cloudflare Access.

---

## Environment

### API Worker (`apps/api/wrangler.jsonc`)
- D1 binding: `DB`
- Secret: `AI_API_KEY` (set via `wrangler secret put`)

### Web/Admin (`.dev.vars` and Cloudflare env)
- `API_URL` / `PUBLIC_API_URL`: API base URL

---

## Implementation Order

1. **Schema**: Drizzle schema in `packages/db/src/schema/` (news_items, translations, glossary)
2. **Shared**: Freshness helpers, category constants, scraper types
3. **List Scraper**: Async iterator for fetching list pages
4. **API** (Cloudflare Worker):
   - Public routes (news list, news detail with lazy body fetch)
   - Admin routes (scrape trigger, stats, recheck queue)
   - Translation concurrency + AI integration
5. **Cron Job**: Scheduled list scraping
6. **Web** (Cloudflare Pages): SSR pages fetching from API
7. **Admin** (Cloudflare Pages): Static pages with React components
8. **Deploy**: D1 migrations, secrets, DNS

**Deferred**:
- `topics` table and rich text support
- WebSub hub implementation (keep `publishUpdate()` hook)
- Multi-language translation (schema ready, UI not)

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Two-phase scraping | List pages are cheap; detail pages are expensive. Defer body fetch until needed. |
| Async iterator for list scraping | Clean abstraction, easy to stop early or continue through all pages |
| `content_ja` nullable | Indicates whether body has been fetched yet |
| `body_fetching_since` lock | Prevents concurrent fetches of same article body in serverless |
| Separate `news_items` / `topics` tables | Different content types (plaintext vs HTML), different source URLs |
| Shared `translations` table with `item_type` | Single translation system for both content types |
| Normalize categories to English | Consistent filtering, URL-friendly slugs |
| Age-based freshness backoff | Stateless, no counter, self-adjusting |
| `translating_since` column | No separate jobs table for serverless |
| Compare timestamps for staleness | Simpler than hashing content |
| Web SSR, Admin static+islands | SSR for SEO; client-fetch for interactivity |
| WebSub for events | Standard protocol, external clients can subscribe without custom integration |
| `publishUpdate()` hook point | Defers full WebSub implementation, enables future pub/sub |
| `DELETE /api/news/:id/body` | Invalidate cache, lazy re-fetch on next request. RESTful. |
| `DELETE /api/news/:id/:lang` | RESTful; cleaner than POST with body |
| All Cloudflare (Workers + Pages + D1) | Single platform, no external dependencies |
