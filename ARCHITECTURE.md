# Cloudflare Monorepo Template

A Cloudflare-native monorepo structure for apps with:

- **API** — Hono + Drizzle + D1 (TypeScript)
- **Web** — Astro hybrid SSG/SSR with aggressive caching (public frontend)
- **Admin** — Astro static + React islands, protected by Cloudflare Access

All data flows through the API. Frontend apps are presentation layers only.

## Goals

- Minimal complexity for a solo developer
- Shared database schema and types across apps
- Independent deployability per app
- Zero auth code for admin (Cloudflare Access handles it)
- Heavy caching on public SSR routes
- Local development with hot reload

---

## Directory Structure

```
my-app/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .gitignore
│
├── packages/
│   ├── db/
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   └── index.ts          # Export all schema tables
│   │   │   ├── client.ts
│   │   │   └── index.ts
│   │   ├── drizzle.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/
│       ├── src/
│       │   ├── types.ts
│       │   ├── constants.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   └── lib/
│   │   ├── wrangler.jsonc
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── web/
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   ├── layouts/
│   │   │   └── components/
│   │   ├── public/
│   │   ├── astro.config.mjs
│   │   ├── wrangler.jsonc
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── admin/
│       ├── src/
│       │   ├── pages/
│       │   ├── layouts/
│       │   └── components/           # React islands
│       ├── public/
│       ├── astro.config.mjs
│       ├── wrangler.jsonc
│       ├── package.json
│       └── tsconfig.json
│
└── migrations/
    └── .gitkeep
```

---

## Root Configuration

### `package.json`

```json
{
  "name": "my-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "deploy": "turbo deploy",
    "typecheck": "turbo typecheck",
    "db:generate": "pnpm --filter @myapp/db drizzle-kit generate",
    "db:migrate:local": "wrangler d1 migrations apply my-db --local --config apps/api/wrangler.jsonc",
    "db:migrate:prod": "wrangler d1 migrations apply my-db --remote --config apps/api/wrangler.jsonc"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0",
    "wrangler": "^3.0.0"
  }
}
```

### `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".astro/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "deploy": {
      "dependsOn": ["build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

### `.gitignore`

```
node_modules/
dist/
.astro/
.wrangler/
.turbo/
.DS_Store
*.log
.env
.env.*
!.env.example
```

---

## Package: `@myapp/db`

Shared Drizzle schema and client factory.

### `packages/db/package.json`

```json
{
  "name": "@myapp/db",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts"
  },
  "scripts": {
    "generate": "drizzle-kit generate"
  },
  "dependencies": {
    "drizzle-orm": "^0.30.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.0.0",
    "drizzle-kit": "^0.21.0",
    "typescript": "^5.4.0"
  }
}
```

### `packages/db/drizzle.config.ts`

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "../../migrations",
  dialect: "sqlite",
});
```

### `packages/db/src/client.ts`

```typescript
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;
```

---

## Package: `@myapp/shared`

Shared types, validation schemas, and utilities.

### `packages/shared/package.json`

```json
{
  "name": "@myapp/shared",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

---

## App: API Worker

### `apps/api/wrangler.jsonc`

```jsonc
{
  "name": "my-app-api",
  "main": "src/index.ts",
  "compatibility_date": "2024-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "my-db",
      "database_id": "YOUR_DATABASE_ID"
    }
  ]
}
```

### `apps/api/src/index.ts`

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb } from "@myapp/db";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors());

app.use("*", async (c, next) => {
  c.set("db", createDb(c.env.DB));
  await next();
});

// Mount routes here

export default app;
```

---

## App: Web (Astro SSR)

### `apps/web/astro.config.mjs`

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

### `apps/web/wrangler.jsonc`

```jsonc
{
  "name": "my-app-web",
  "pages_build_output_dir": "./dist",
  "compatibility_date": "2024-01-01",
  "compatibility_flags": ["nodejs_compat"]
}
```

---

## App: Admin (Static + React Islands)

### `apps/admin/astro.config.mjs`

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

Admin uses `client:load` directive for React components that need interactivity.

---

## Database Migrations

```bash
# 1. Edit schema in packages/db/src/schema/*.ts

# 2. Generate migration
pnpm db:generate

# 3. Apply to local D1
pnpm db:migrate:local

# 4. Test locally
pnpm dev

# 5. Apply to production
pnpm db:migrate:prod

# 6. Deploy apps
pnpm deploy
```

### Initial Setup

```bash
# Create the D1 database
wrangler d1 create my-db

# Copy the database_id to apps/api/wrangler.jsonc

# Generate and apply initial migration
pnpm db:generate
pnpm db:migrate:local
```

---

## Deployment

| App | Platform | Domain Pattern |
|-----|----------|----------------|
| API | Workers | `api.example.com` |
| Web | Pages | `example.com` |
| Admin | Pages + Access | `admin.example.com` |

```bash
# Deploy all
pnpm deploy

# Deploy individual
pnpm --filter @myapp/api deploy
pnpm --filter @myapp/web deploy
pnpm --filter @myapp/admin deploy
```

### Cloudflare Access for Admin

1. Go to Workers & Pages → admin app → Settings → Domains & Routes
2. Enable Cloudflare Access on your custom domain
3. In Zero Trust dashboard, configure allowed emails/domains

---

## Local Development

```bash
pnpm install
pnpm db:migrate:local
pnpm dev
```

Default ports:
- API: http://localhost:8787
- Web: http://localhost:4321
- Admin: http://localhost:4322

### `.dev.vars` (for each app)

```
API_URL=http://localhost:8787
```
