# Phase 8: Admin Panel (Static + React Islands)

Build the internal admin interface with Astro static pages and React components.

## Tasks

### 8.1 Set Up apps/admin

**Dependencies**:
- `astro`
- `@astrojs/cloudflare`
- `@astrojs/react`
- `react`, `react-dom`
- `@hiroba/shared` (workspace)

**`apps/admin/package.json`**

```json
{
  "name": "@hiroba/admin",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev --port 4322",
    "build": "astro build",
    "preview": "astro preview",
    "deploy": "wrangler pages deploy dist"
  },
  "dependencies": {
    "astro": "^4.0.0",
    "@astrojs/cloudflare": "^10.0.0",
    "@astrojs/react": "^3.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@hiroba/shared": "workspace:*"
  }
}
```

**`apps/admin/astro.config.mjs`**

```javascript
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";

export default defineConfig({
  output: "static",
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  integrations: [react()],
});
```

### 8.2 Create Admin API Client

**`apps/admin/src/lib/api.ts`**

```typescript
const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:8787";

function getApiKey(): string {
  // In production, this would come from Cloudflare Access headers
  // or be injected at build time
  return localStorage.getItem("admin_api_key") || "";
}

async function adminFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${getApiKey()}`,
    },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
}

export async function getStats() {
  return adminFetch("/api/admin/stats");
}

export async function getRecheckQueue(limit = 50) {
  return adminFetch(`/api/admin/recheck-queue?limit=${limit}`);
}

export async function triggerScrape(full = false) {
  return adminFetch(`/api/admin/scrape?full=${full}`, { method: "POST" });
}

export async function getNewsList(options?: { category?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (options?.category) params.set("category", options.category);
  if (options?.limit) params.set("limit", String(options.limit));
  return fetch(`${API_URL}/api/news?${params}`).then(r => r.json());
}

export async function invalidateBody(id: string) {
  return adminFetch(`/api/news/${id}/body`, { method: "DELETE" });
}

export async function deleteTranslation(id: string, lang: string) {
  return adminFetch(`/api/news/${id}/${lang}`, { method: "DELETE" });
}

export async function getGlossary(lang?: string) {
  const params = lang ? `?lang=${lang}` : "";
  return adminFetch(`/api/glossary${params}`);
}

export async function importGlossary(file: File, targetLanguage: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("targetLanguage", targetLanguage);

  return adminFetch("/api/glossary/import", {
    method: "POST",
    body: formData,
  });
}

export async function deleteGlossaryEntry(sourceText: string, lang: string) {
  return adminFetch(
    `/api/glossary/${encodeURIComponent(sourceText)}/${lang}`,
    { method: "DELETE" }
  );
}
```

### 8.3 Create Layout

**`apps/admin/src/layouts/Layout.astro`**

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
    <title>{title} | DQX Admin</title>
    <link rel="stylesheet" href="/styles/admin.css" />
  </head>
  <body>
    <nav class="sidebar">
      <h1>DQX Admin</h1>
      <ul>
        <li><a href="/">Dashboard</a></li>
        <li><a href="/news">News</a></li>
        <li><a href="/recheck-queue">Recheck Queue</a></li>
        <li><a href="/glossary">Glossary</a></li>
      </ul>
    </nav>
    <main>
      <slot />
    </main>
  </body>
</html>
```

### 8.4 Create Dashboard Page

**`apps/admin/src/pages/index.astro`**

```astro
---
import Layout from "../layouts/Layout.astro";
import Dashboard from "../components/Dashboard";
---

<Layout title="Dashboard">
  <h1>Dashboard</h1>
  <Dashboard client:load />
</Layout>
```

**`apps/admin/src/components/Dashboard.tsx`**

```tsx
import { useEffect, useState } from "react";
import { getStats, triggerScrape } from "../lib/api";

interface Stats {
  totalItems: number;
  itemsWithBody: number;
  itemsTranslated: number;
  itemsPendingRecheck: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    try {
      const data = await getStats();
      setStats(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function handleScrape(full: boolean) {
    setScraping(true);
    try {
      const result = await triggerScrape(full);
      alert(`Scrape complete: ${result.totalNewItems} new items`);
      loadStats();
    } catch (err) {
      alert("Scrape failed");
    }
    setScraping(false);
  }

  if (loading) return <p>Loading...</p>;
  if (!stats) return <p>Failed to load stats</p>;

  return (
    <div className="dashboard">
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Items</h3>
          <p className="stat-value">{stats.totalItems}</p>
        </div>
        <div className="stat-card">
          <h3>With Body</h3>
          <p className="stat-value">{stats.itemsWithBody}</p>
        </div>
        <div className="stat-card">
          <h3>Translated</h3>
          <p className="stat-value">{stats.itemsTranslated}</p>
        </div>
        <div className="stat-card">
          <h3>Pending Recheck</h3>
          <p className="stat-value">{stats.itemsPendingRecheck}</p>
        </div>
      </div>

      <div className="actions">
        <button onClick={() => handleScrape(false)} disabled={scraping}>
          {scraping ? "Scraping..." : "Scrape New"}
        </button>
        <button onClick={() => handleScrape(true)} disabled={scraping}>
          Full Scrape
        </button>
      </div>
    </div>
  );
}
```

### 8.5 Create News List Page

**`apps/admin/src/pages/news/index.astro`**

```astro
---
import Layout from "../../layouts/Layout.astro";
import NewsList from "../../components/NewsList";
---

<Layout title="News">
  <h1>News Management</h1>
  <NewsList client:load />
</Layout>
```

**`apps/admin/src/components/NewsList.tsx`**

```tsx
import { useEffect, useState } from "react";
import { getNewsList, invalidateBody, deleteTranslation } from "../lib/api";

interface NewsItem {
  id: string;
  titleJa: string;
  category: string;
  publishedAt: number;
  contentJa: string | null;
}

export default function NewsList() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    setLoading(true);
    try {
      const { items } = await getNewsList({ limit: 50 });
      setItems(items);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function handleInvalidateBody(id: string) {
    if (!confirm("Invalidate cached body?")) return;
    await invalidateBody(id);
    loadItems();
  }

  async function handleDeleteTranslation(id: string) {
    if (!confirm("Delete English translation?")) return;
    await deleteTranslation(id, "en");
    alert("Translation deleted");
  }

  if (loading) return <p>Loading...</p>;

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Category</th>
          <th>Date</th>
          <th>Body</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>
              <a href={`/news/${item.id}`}>{item.titleJa}</a>
            </td>
            <td>{item.category}</td>
            <td>{new Date(item.publishedAt * 1000).toLocaleDateString()}</td>
            <td>{item.contentJa ? "✓" : "—"}</td>
            <td>
              <button onClick={() => handleInvalidateBody(item.id)}>
                Invalidate Body
              </button>
              <button onClick={() => handleDeleteTranslation(item.id)}>
                Delete Translation
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### 8.6 Create Recheck Queue Page

**`apps/admin/src/pages/recheck-queue.astro`**

```astro
---
import Layout from "../layouts/Layout.astro";
import RecheckQueue from "../components/RecheckQueue";
---

<Layout title="Recheck Queue">
  <h1>Recheck Queue</h1>
  <p>Items due for body recheck based on age-based freshness rules.</p>
  <RecheckQueue client:load />
</Layout>
```

**`apps/admin/src/components/RecheckQueue.tsx`**

```tsx
import { useEffect, useState } from "react";
import { getRecheckQueue, invalidateBody } from "../lib/api";

interface QueueItem {
  id: string;
  titleJa: string;
  category: string;
  publishedAt: number;
  bodyFetchedAt: number;
  nextCheckAt: number;
}

export default function RecheckQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQueue();
  }, []);

  async function loadQueue() {
    setLoading(true);
    try {
      const { items } = await getRecheckQueue();
      setItems(items);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function handleInvalidate(id: string) {
    await invalidateBody(id);
    loadQueue();
  }

  if (loading) return <p>Loading...</p>;
  if (items.length === 0) return <p>No items due for recheck.</p>;

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Category</th>
          <th>Last Fetched</th>
          <th>Overdue By</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>{item.titleJa}</td>
            <td>{item.category}</td>
            <td>
              {item.bodyFetchedAt
                ? new Date(item.bodyFetchedAt * 1000).toLocaleString()
                : "Never"}
            </td>
            <td>{formatOverdue(item.nextCheckAt)}</td>
            <td>
              <button onClick={() => handleInvalidate(item.id)}>
                Invalidate
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatOverdue(nextCheckAt: number): string {
  const diff = Date.now() - nextCheckAt;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}
```

### 8.7 Create Glossary Pages

**`apps/admin/src/pages/glossary/index.astro`**

```astro
---
import Layout from "../../layouts/Layout.astro";
import GlossaryList from "../../components/GlossaryList";
---

<Layout title="Glossary">
  <h1>Glossary</h1>
  <p><a href="/glossary/import">Import CSV</a></p>
  <GlossaryList client:load />
</Layout>
```

**`apps/admin/src/pages/glossary/import.astro`**

```astro
---
import Layout from "../../layouts/Layout.astro";
import GlossaryImport from "../../components/GlossaryImport";
---

<Layout title="Import Glossary">
  <h1>Import Glossary</h1>
  <p>Upload a CSV file with format: <code>japanese_text,translated_text</code></p>
  <GlossaryImport client:load />
</Layout>
```

**`apps/admin/src/components/GlossaryList.tsx`**

```tsx
import { useEffect, useState } from "react";
import { getGlossary, deleteGlossaryEntry } from "../lib/api";

interface GlossaryEntry {
  sourceText: string;
  targetLanguage: string;
  translatedText: string;
  updatedAt: number;
}

export default function GlossaryList() {
  const [entries, setEntries] = useState<GlossaryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    setLoading(true);
    try {
      const { entries } = await getGlossary("en");
      setEntries(entries);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function handleDelete(sourceText: string, lang: string) {
    if (!confirm(`Delete "${sourceText}"?`)) return;
    await deleteGlossaryEntry(sourceText, lang);
    loadEntries();
  }

  if (loading) return <p>Loading...</p>;
  if (entries.length === 0) return <p>No glossary entries.</p>;

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Japanese</th>
          <th>English</th>
          <th>Updated</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={`${entry.sourceText}-${entry.targetLanguage}`}>
            <td>{entry.sourceText}</td>
            <td>{entry.translatedText}</td>
            <td>{new Date(entry.updatedAt * 1000).toLocaleDateString()}</td>
            <td>
              <button
                onClick={() =>
                  handleDelete(entry.sourceText, entry.targetLanguage)
                }
              >
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

**`apps/admin/src/components/GlossaryImport.tsx`**

```tsx
import { useState } from "react";
import { importGlossary } from "../lib/api";

export default function GlossaryImport() {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("en");
  const [importing, setImporting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setImporting(true);
    try {
      const result = await importGlossary(file, language);
      alert(`Imported ${result.imported} entries`);
      window.location.href = "/glossary";
    } catch (err) {
      alert("Import failed");
    }
    setImporting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="import-form">
      <div>
        <label>CSV File</label>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <div>
        <label>Target Language</label>
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="en">English</option>
        </select>
      </div>
      <button type="submit" disabled={!file || importing}>
        {importing ? "Importing..." : "Import"}
      </button>
    </form>
  );
}
```

### 8.8 Add Admin Styles

**`apps/admin/public/styles/admin.css`**

```css
:root {
  --sidebar-width: 200px;
  --color-bg: #f5f5f5;
  --color-sidebar: #1a1a2e;
  --color-primary: #4a90d9;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, sans-serif;
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: var(--sidebar-width);
  background: var(--sidebar-bg);
  color: white;
  padding: 1rem;
}

.sidebar h1 {
  font-size: 1.2rem;
  margin-bottom: 1rem;
}

.sidebar ul {
  list-style: none;
}

.sidebar a {
  color: #ccc;
  text-decoration: none;
  display: block;
  padding: 0.5rem 0;
}

.sidebar a:hover {
  color: white;
}

main {
  flex: 1;
  padding: 2rem;
  background: var(--color-bg);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: white;
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stat-value {
  font-size: 2rem;
  font-weight: bold;
  color: var(--color-primary);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
}

.data-table th,
.data-table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.data-table th {
  background: #f9f9f9;
  font-weight: 600;
}

button {
  background: var(--color-primary);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 0.5rem;
}

button:hover {
  opacity: 0.9;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.import-form {
  max-width: 400px;
}

.import-form > div {
  margin-bottom: 1rem;
}

.import-form label {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: 500;
}

.import-form input,
.import-form select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}
```

## Files to Create

- `apps/admin/package.json`
- `apps/admin/tsconfig.json`
- `apps/admin/astro.config.mjs`
- `apps/admin/wrangler.jsonc`
- `apps/admin/src/env.d.ts`
- `apps/admin/src/lib/api.ts`
- `apps/admin/src/layouts/Layout.astro`
- `apps/admin/src/pages/index.astro`
- `apps/admin/src/pages/news/index.astro`
- `apps/admin/src/pages/news/[id].astro`
- `apps/admin/src/pages/recheck-queue.astro`
- `apps/admin/src/pages/glossary/index.astro`
- `apps/admin/src/pages/glossary/import.astro`
- `apps/admin/src/components/Dashboard.tsx`
- `apps/admin/src/components/NewsList.tsx`
- `apps/admin/src/components/RecheckQueue.tsx`
- `apps/admin/src/components/GlossaryList.tsx`
- `apps/admin/src/components/GlossaryImport.tsx`
- `apps/admin/public/styles/admin.css`

## Commit

```
feat: add admin panel with React islands

- Set up Astro with React integration for interactive components
- Create dashboard with stats and scrape buttons
- Add news management page with invalidate/delete actions
- Add recheck queue page showing overdue items
- Create glossary management with list and CSV import
- Style admin interface with sidebar navigation
```

## Notes

- Static output with `client:load` for interactive components
- Protected by Cloudflare Access (configured separately)
- API key stored in localStorage for dev; in production, use Access headers
- News detail page (`/news/[id]`) can be added later for more detailed view
