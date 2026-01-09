# Phase 7: Web Frontend (Astro SSR)

Build the public-facing website with Astro and Cloudflare Pages.

## Tasks

### 7.1 Set Up apps/web

**Dependencies**:
- `astro`
- `@astrojs/cloudflare`
- `@hiroba/shared` (workspace)

**`apps/web/package.json`**

```json
{
  "name": "@hiroba/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev --port 4321",
    "build": "astro build",
    "preview": "astro preview",
    "deploy": "wrangler pages deploy dist"
  },
  "dependencies": {
    "astro": "^4.0.0",
    "@astrojs/cloudflare": "^10.0.0",
    "@hiroba/shared": "workspace:*"
  }
}
```

**`apps/web/astro.config.mjs`**

```javascript
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
});
```

**`apps/web/wrangler.jsonc`**

```jsonc
{
  "name": "hiroba-web",
  "pages_build_output_dir": "./dist",
  "compatibility_date": "2024-01-01",
  "compatibility_flags": ["nodejs_compat"]
}
```

### 7.2 Create API Client

**`apps/web/src/lib/api.ts`**

```typescript
const API_URL = import.meta.env.API_URL || "http://localhost:8787";

export interface NewsItem {
  id: string;
  titleJa: string;
  category: string;
  publishedAt: number;
  contentJa: string | null;
}

export interface Translation {
  title: string;
  content: string;
  translatedAt: number;
}

export async function getNewsList(options?: {
  category?: string;
  limit?: number;
  cursor?: string;
}): Promise<{ items: NewsItem[]; hasMore: boolean; nextCursor?: string }> {
  const params = new URLSearchParams();
  if (options?.category) params.set("category", options.category);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.cursor) params.set("cursor", options.cursor);

  const res = await fetch(`${API_URL}/api/news?${params}`);
  if (!res.ok) throw new Error("Failed to fetch news");
  return res.json();
}

export async function getNewsItem(
  id: string,
  lang: string = "en"
): Promise<{ item: NewsItem; translation?: Translation }> {
  const res = await fetch(`${API_URL}/api/news/${id}/${lang}`);
  if (!res.ok) throw new Error("Failed to fetch news item");
  return res.json();
}
```

### 7.3 Create Layout

**`apps/web/src/layouts/Layout.astro`**

```astro
---
interface Props {
  title: string;
}

const { title } = Astro.props;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title} | DQX News</title>
    <link rel="stylesheet" href="/styles/global.css" />
  </head>
  <body>
    <header>
      <nav>
        <a href="/">Home</a>
        <a href="/category/news">News</a>
        <a href="/category/event">Events</a>
        <a href="/category/update">Updates</a>
        <a href="/category/maintenance">Maintenance</a>
      </nav>
    </header>
    <main>
      <slot />
    </main>
    <footer>
      <p>Translated from <a href="https://hiroba.dqx.jp">DQX Hiroba</a></p>
    </footer>
  </body>
</html>
```

### 7.4 Create Home Page

**`apps/web/src/pages/index.astro`**

```astro
---
import Layout from "../layouts/Layout.astro";
import { getNewsList } from "../lib/api";
import { CATEGORY_LABELS } from "@hiroba/shared";

const categories = ["news", "event", "update", "maintenance"] as const;

const newsByCategory = await Promise.all(
  categories.map(async (category) => {
    const { items } = await getNewsList({ category, limit: 5 });
    return { category, items };
  })
);
---

<Layout title="Latest News">
  <h1>DQX News</h1>

  {newsByCategory.map(({ category, items }) => (
    <section>
      <h2>
        <a href={`/category/${category}`}>{CATEGORY_LABELS[category]}</a>
      </h2>
      <ul>
        {items.map((item) => (
          <li>
            <a href={`/news/${item.id}`}>
              {item.titleJa}
            </a>
            <time datetime={new Date(item.publishedAt * 1000).toISOString()}>
              {new Date(item.publishedAt * 1000).toLocaleDateString()}
            </time>
          </li>
        ))}
      </ul>
      <a href={`/category/${category}`}>View all →</a>
    </section>
  ))}
</Layout>
```

### 7.5 Create News Detail Page

**`apps/web/src/pages/news/[id].astro`**

```astro
---
import Layout from "../../layouts/Layout.astro";
import { getNewsItem } from "../../lib/api";

const { id } = Astro.params;

if (!id) {
  return Astro.redirect("/");
}

const { item, translation } = await getNewsItem(id, "en");

if (!item) {
  return new Response("Not found", { status: 404 });
}

const title = translation?.title || item.titleJa;
const content = translation?.content || item.contentJa || "Content not available";
---

<Layout title={title}>
  <article>
    <header>
      <h1>{title}</h1>
      <p class="meta">
        <span class="category">{item.category}</span>
        <time datetime={new Date(item.publishedAt * 1000).toISOString()}>
          {new Date(item.publishedAt * 1000).toLocaleDateString()}
        </time>
      </p>
    </header>

    <div class="content" set:html={content.replace(/\n/g, "<br>")} />

    {translation && (
      <footer class="translation-info">
        <p>
          Translated on {new Date(translation.translatedAt * 1000).toLocaleDateString()}
        </p>
        <details>
          <summary>View original Japanese</summary>
          <h2>{item.titleJa}</h2>
          <div set:html={item.contentJa?.replace(/\n/g, "<br>")} />
        </details>
      </footer>
    )}
  </article>
</Layout>
```

### 7.6 Create Category Page

**`apps/web/src/pages/category/[slug].astro`**

```astro
---
import Layout from "../../layouts/Layout.astro";
import { getNewsList } from "../../lib/api";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@hiroba/shared";

const { slug } = Astro.params;

if (!slug || !CATEGORIES.includes(slug as Category)) {
  return Astro.redirect("/");
}

const category = slug as Category;
const cursor = Astro.url.searchParams.get("cursor") ?? undefined;

const { items, hasMore, nextCursor } = await getNewsList({
  category,
  limit: 20,
  cursor,
});

const categoryLabel = CATEGORY_LABELS[category];
---

<Layout title={categoryLabel}>
  <h1>{categoryLabel}</h1>

  <ul class="news-list">
    {items.map((item) => (
      <li>
        <a href={`/news/${item.id}`}>
          <span class="title">{item.titleJa}</span>
          <time datetime={new Date(item.publishedAt * 1000).toISOString()}>
            {new Date(item.publishedAt * 1000).toLocaleDateString()}
          </time>
        </a>
      </li>
    ))}
  </ul>

  {hasMore && nextCursor && (
    <a href={`/category/${category}?cursor=${nextCursor}`} class="load-more">
      Load more →
    </a>
  )}
</Layout>
```

### 7.7 Add Caching Headers

**`apps/web/src/middleware.ts`**

```typescript
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  // Cache SSR pages for 5 minutes, stale-while-revalidate for 1 hour
  if (context.url.pathname.startsWith("/news/") ||
      context.url.pathname.startsWith("/category/") ||
      context.url.pathname === "/") {
    response.headers.set(
      "Cache-Control",
      "public, max-age=300, stale-while-revalidate=3600"
    );
  }

  return response;
});
```

### 7.8 Add Basic Styles

**`apps/web/public/styles/global.css`**

```css
:root {
  --color-bg: #fafafa;
  --color-text: #333;
  --color-link: #0066cc;
  --color-muted: #666;
  --max-width: 800px;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, sans-serif;
  line-height: 1.6;
  color: var(--color-text);
  background: var(--color-bg);
}

header nav {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  max-width: var(--max-width);
  margin: 0 auto;
}

main {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 1rem;
}

a {
  color: var(--color-link);
}

.news-list {
  list-style: none;
}

.news-list li {
  padding: 0.5rem 0;
  border-bottom: 1px solid #eee;
}

.meta {
  color: var(--color-muted);
  font-size: 0.9rem;
}

.category {
  text-transform: uppercase;
  font-size: 0.8rem;
  background: #eee;
  padding: 0.2rem 0.5rem;
  border-radius: 3px;
}
```

## Files to Create

- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/astro.config.mjs`
- `apps/web/wrangler.jsonc`
- `apps/web/src/env.d.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/layouts/Layout.astro`
- `apps/web/src/pages/index.astro`
- `apps/web/src/pages/news/[id].astro`
- `apps/web/src/pages/category/[slug].astro`
- `apps/web/src/middleware.ts`
- `apps/web/public/styles/global.css`

## Commit

```
feat: add public web frontend with SSR

- Set up Astro with Cloudflare Pages adapter
- Create API client for fetching news data
- Implement home page with news grouped by category
- Add news detail page with translation display
- Add category listing page with pagination
- Configure caching headers for SSR responses
- Add basic responsive styling
```

## Notes

- SSR mode for SEO and fresh content
- Caching headers reduce load on API
- Titles shown in Japanese on list pages (translation fetched on detail page)
- Original Japanese content available in collapsible section
- Pagination uses cursor-based approach
