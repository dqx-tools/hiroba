# Hiroba - Dragon Quest X News Translation

A monorepo for translating news content from hiroba.dqx.jp (Dragon Quest X community portal).

## Project Structure

```
hiroba/
├── apps/
│   ├── api/          # Cloudflare Worker - Hono REST API
│   ├── web/          # Astro SSR - Public frontend
│   └── admin/        # Astro + React - Admin panel
├── packages/
│   ├── db/           # Drizzle ORM schema and migrations
│   └── shared/       # Shared types and constants
├── turbo.json        # Turborepo config
└── package.json      # Root workspace config
```

## Features

- Scrapes news from all 4 categories: News, Events, Updates, Maintenance
- Translates Japanese content to English using OpenAI
- Uses a glossary for consistent game terminology
- Caches translations in Cloudflare D1
- Age-based freshness system for re-checking article bodies
- Admin panel for managing translations and glossary

## Prerequisites

- Node.js 20+
- pnpm 9+
- Cloudflare account (for D1 database and Workers)
- OpenAI API key

## Quick Start

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp apps/api/.env.example apps/api/.env
# Edit .env with your OPENAI_API_KEY and ADMIN_API_KEY

# Run database migrations (local)
pnpm db:migrate:local

# Start all apps in development mode
pnpm dev
```

This starts:
- **API**: http://localhost:8787
- **Web**: http://localhost:4321
- **Admin**: http://localhost:4322

## Running Individual Apps

```bash
# API only
pnpm --filter @hiroba/api dev

# Web frontend only
pnpm --filter @hiroba/web dev

# Admin panel only
pnpm --filter @hiroba/admin dev
```

## API Endpoints

### Public Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info and available endpoints |
| `/api/news` | GET | List news items (paginated) |
| `/api/news/:id` | GET | Get news item (Japanese) |
| `/api/news/:id/:lang` | GET | Get translated news item |

#### Query Parameters for `/api/news`

- `category` - Filter by category (news, event, update, maintenance)
- `cursor` - Cursor for pagination
- `limit` - Items per page (default: 50)

### Admin Endpoints (require `Authorization: Bearer <ADMIN_API_KEY>`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/scrape` | POST | Trigger news scrape |
| `/api/admin/stats` | GET | Get database statistics |
| `/api/admin/recheck-queue` | GET | Items due for body refresh |
| `/api/admin/news/:id/body` | DELETE | Invalidate cached body |
| `/api/admin/news/:id/:lang` | DELETE | Delete translation |
| `/api/admin/glossary` | GET | List glossary entries |
| `/api/admin/glossary/import` | POST | Import glossary CSV |
| `/api/admin/glossary/:sourceText/:lang` | DELETE | Delete glossary entry |

## Database

The project uses Cloudflare D1 with Drizzle ORM.

Migrations are SQL files in `apps/api/migrations/`. To create a new migration, add a numbered SQL file (e.g., `0002_add_column.sql`).

```bash
# Apply migrations locally
pnpm db:migrate:local

# Apply migrations to production
pnpm db:migrate:prod
```

## Testing

```bash
# Run all tests
pnpm test

# Run API tests only
pnpm --filter @hiroba/api test

# Watch mode
pnpm --filter @hiroba/api test:watch
```

## Type Checking

```bash
# Check all packages
pnpm typecheck

# Check specific package
pnpm --filter @hiroba/api typecheck
```

## Deployment

Each app deploys to Cloudflare:

```bash
# Deploy everything
pnpm deploy

# Deploy individual apps
pnpm --filter @hiroba/api deploy   # Workers
pnpm --filter @hiroba/web deploy   # Pages
pnpm --filter @hiroba/admin deploy # Pages
```

### Environment Variables

Set these as Cloudflare secrets for the API worker:

```bash
cd apps/api
wrangler secret put OPENAI_API_KEY
wrangler secret put ADMIN_API_KEY
```

## Scheduled Jobs

The API worker has two cron triggers:

- **Hourly** (`0 * * * *`): Scrapes first page of each category for new articles
- **Daily** (`0 15 * * *`): Refreshes the translation glossary

## License

MIT
