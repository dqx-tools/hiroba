# Implementation Plans

This directory contains sequential build plans for the Hiroba news translation app.

## Overview

| Phase | Focus | Key Deliverables |
|-------|-------|------------------|
| [1](./phase-1-monorepo-foundation.md) | Monorepo Foundation | pnpm workspaces, Turborepo, migrate existing code |
| [2](./phase-2-database-schema.md) | Database Schema | Drizzle schema, D1 migrations |
| [3](./phase-3-shared-package.md) | Shared Package | Types, constants, freshness helpers |
| [4](./phase-4-api-core.md) | API Core | Hono setup, list scraper, basic routes |
| [5](./phase-5-body-translation.md) | Body & Translation | Lazy fetch, concurrency locks, AI translation |
| [6](./phase-6-admin-cron.md) | Admin & Cron | Admin endpoints, scheduled scraping |
| [7](./phase-7-web-frontend.md) | Web Frontend | Astro SSR public site |
| [8](./phase-8-admin-panel.md) | Admin Panel | Astro + React admin interface |
| [9](./phase-9-deployment.md) | Deployment | Production setup, DNS, Cloudflare Access |

## Dependencies

```
Phase 1 (Foundation)
    │
    ├── Phase 2 (Schema)
    │       │
    │       └── Phase 3 (Shared)
    │               │
    │               └── Phase 4 (API Core)
    │                       │
    │                       ├── Phase 5 (Body/Translation)
    │                       │       │
    │                       │       └── Phase 6 (Admin/Cron)
    │                       │
    │                       ├── Phase 7 (Web) ──────┐
    │                       │                       │
    │                       └── Phase 8 (Admin) ────┤
    │                                               │
    └───────────────────────────────────────────────┴── Phase 9 (Deploy)
```

## Commit Strategy

Each phase ends with a single commit. Commit messages follow conventional commits format:

- `feat:` for new features (phases 1-8)
- `chore:` for non-feature work (phase 9)

## Deferred Work

Not included in these phases (per PLAN.md):

- `topics` table and rich text content support
- Full WebSub hub implementation (stub exists)
- Multi-language translation UI (schema supports it)

## Quick Reference

### Start Development
```bash
pnpm install
pnpm db:migrate:local
pnpm dev
```

### Generate Migration
```bash
pnpm db:generate
```

### Deploy
```bash
pnpm deploy
```
