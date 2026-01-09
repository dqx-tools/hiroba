# Phase 1: Monorepo Foundation

Set up the monorepo structure and migrate existing code from `workers/news/` to the new architecture.

## Tasks

### 1.1 Create Root Configuration Files

**`package.json`**
- name: `hiroba`
- private: true
- type: module
- Scripts: `dev`, `build`, `deploy`, `typecheck`, `db:generate`, `db:migrate:local`, `db:migrate:prod`
- devDependencies: turbo, typescript, wrangler

**`pnpm-workspace.yaml`**
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**`turbo.json`**
- Configure tasks: build, dev, deploy, typecheck
- Set up proper dependency chains

**`tsconfig.base.json`**
- ES2022 target, ESNext module
- Bundler module resolution
- Strict mode enabled

### 1.2 Create Directory Structure

```
hiroba/
├── apps/
│   ├── api/
│   ├── web/
│   └── admin/
├── packages/
│   ├── db/
│   └── shared/
└── migrations/
```

### 1.3 Migrate Existing Code

Move from `workers/news/` to `apps/api/`:
- `src/index.ts` → `apps/api/src/index.ts`
- `src/scraper.ts` → `apps/api/src/lib/scraper.ts`
- `src/translator.ts` → `apps/api/src/lib/translator.ts`
- `src/glossary.ts` → `apps/api/src/lib/glossary.ts`
- `src/cache.ts` → `apps/api/src/lib/cache.ts`
- `wrangler.jsonc` → `apps/api/wrangler.jsonc`

Update imports and paths after migration.

### 1.4 Create Package Stubs

**`packages/db/package.json`**
```json
{
  "name": "@hiroba/db",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts"
  }
}
```

**`packages/shared/package.json`**
```json
{
  "name": "@hiroba/shared",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

### 1.5 Verify Setup

- [ ] `pnpm install` completes successfully
- [ ] `pnpm turbo build` runs without errors
- [ ] `pnpm --filter @hiroba/api dev` starts the API

## Files to Create/Modify

- `package.json` (root)
- `pnpm-workspace.yaml`
- `turbo.json`
- `tsconfig.base.json`
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/wrangler.jsonc`
- `apps/api/src/` (migrated files)
- `packages/db/package.json`
- `packages/db/tsconfig.json`
- `packages/db/src/index.ts` (stub)
- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/shared/src/index.ts` (stub)

## Commit

```
feat: set up monorepo structure with pnpm workspaces and turborepo

- Add root configuration (turbo.json, pnpm-workspace.yaml, tsconfig.base.json)
- Migrate workers/news to apps/api
- Create stub packages for db and shared
- Configure workspace dependencies
```

## Notes

- Delete `workers/news/` after migration is complete and verified
- The existing scraper/translator code will be refactored in later phases
- Keep existing functionality working during migration
