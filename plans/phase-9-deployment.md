# Phase 9: Deployment & Polish

Configure production deployment and finalize documentation.

## Tasks

### 9.1 Create D1 Database

```bash
# Create production database
wrangler d1 create hiroba-db

# Note the database_id from output
# Update apps/api/wrangler.jsonc with the ID
```

### 9.2 Run Migrations

```bash
# Generate migrations (if not already done)
pnpm db:generate

# Apply to production
pnpm db:migrate:prod
```

### 9.3 Set Secrets

```bash
# Set AI API key for translations
wrangler secret put AI_API_KEY --config apps/api/wrangler.jsonc
# Enter your Claude/OpenAI API key when prompted

# Set admin API key
wrangler secret put ADMIN_API_KEY --config apps/api/wrangler.jsonc
# Enter a secure random string when prompted
```

### 9.4 Deploy All Apps

```bash
# Deploy everything
pnpm deploy

# Or deploy individually
pnpm --filter @hiroba/api deploy
pnpm --filter @hiroba/web deploy
pnpm --filter @hiroba/admin deploy
```

### 9.5 Configure Custom Domains

**API Worker**:
1. Go to Workers & Pages → hiroba-api → Settings → Triggers
2. Add custom domain: `api.yourdomain.com`

**Web (Pages)**:
1. Go to Workers & Pages → hiroba-web → Custom domains
2. Add: `yourdomain.com` and `www.yourdomain.com`

**Admin (Pages)**:
1. Go to Workers & Pages → hiroba-admin → Custom domains
2. Add: `admin.yourdomain.com`

### 9.6 Configure Cloudflare Access for Admin

1. Go to Zero Trust → Access → Applications
2. Create new application:
   - Name: `DQX Admin`
   - Domain: `admin.yourdomain.com`
   - Session duration: 24 hours
3. Add policy:
   - Name: `Allowed Users`
   - Action: Allow
   - Include: Emails ending in `@yourdomain.com` (or specific emails)

### 9.7 Configure Environment Variables

**Web app** (`.env` or Cloudflare env vars):
```
API_URL=https://api.yourdomain.com
```

**Admin app** (`.env` or Cloudflare env vars):
```
PUBLIC_API_URL=https://api.yourdomain.com
```

Set via Cloudflare dashboard:
1. Workers & Pages → app → Settings → Environment variables
2. Add production variables

### 9.8 Verify Cron Job

Check that the scheduled trigger is active:
1. Go to Workers & Pages → hiroba-api → Triggers
2. Verify cron trigger: `*/15 * * * *`

Test manually:
```bash
# Trigger via admin API
curl -X POST https://api.yourdomain.com/api/admin/scrape \
  -H "Authorization: Bearer YOUR_ADMIN_KEY"
```

### 9.9 Initial Data Seed

Run a full scrape to populate the database:
```bash
curl -X POST "https://api.yourdomain.com/api/admin/scrape?full=true" \
  -H "Authorization: Bearer YOUR_ADMIN_KEY"
```

### 9.10 Create README

**`README.md`** (root)

```markdown
# Hiroba - DQX News Translation

Scrapes Japanese news from DQX Hiroba, translates to English, and serves via web frontend.

## Stack

- **API**: Cloudflare Workers + Hono + Drizzle + D1
- **Web**: Cloudflare Pages + Astro SSR
- **Admin**: Cloudflare Pages + Astro + React

## Development

\`\`\`bash
# Install dependencies
pnpm install

# Set up local database
pnpm db:migrate:local

# Start all apps
pnpm dev
\`\`\`

Default ports:
- API: http://localhost:8787
- Web: http://localhost:4321
- Admin: http://localhost:4322

## Deployment

\`\`\`bash
# Deploy all
pnpm deploy

# Deploy individual app
pnpm --filter @hiroba/api deploy
\`\`\`

## Database Migrations

\`\`\`bash
# Generate migration after schema changes
pnpm db:generate

# Apply to local
pnpm db:migrate:local

# Apply to production
pnpm db:migrate:prod
\`\`\`

## Environment Variables

### API Worker
- `AI_API_KEY`: API key for translation service (secret)
- `ADMIN_API_KEY`: API key for admin endpoints (secret)

### Web/Admin
- `API_URL`: API base URL (e.g., https://api.example.com)

## Project Structure

\`\`\`
hiroba/
├── apps/
│   ├── api/          # Hono API worker
│   ├── web/          # Public Astro site
│   └── admin/        # Admin Astro site
├── packages/
│   ├── db/           # Drizzle schema & client
│   └── shared/       # Types, constants, utils
└── migrations/       # D1 migrations
\`\`\`
```

## Files to Create/Modify

- `apps/api/wrangler.jsonc` (update database_id)
- `apps/web/wrangler.jsonc` (verify config)
- `apps/admin/wrangler.jsonc` (verify config)
- `README.md` (new)

## Commit

```
chore: add deployment configuration and documentation

- Update wrangler configs with production database ID
- Add README with setup and deployment instructions
- Document environment variables and project structure
```

## Post-Deployment Checklist

- [ ] D1 database created
- [ ] Migrations applied to production
- [ ] Secrets set (AI_API_KEY, ADMIN_API_KEY)
- [ ] All apps deployed
- [ ] Custom domains configured
- [ ] Cloudflare Access enabled for admin
- [ ] Environment variables set
- [ ] Cron job running
- [ ] Initial data seeded
- [ ] Web frontend accessible
- [ ] Admin panel accessible (with auth)
- [ ] Translation working

## Notes

- Keep `workers/news/` until migration is verified, then delete
- Monitor Workers analytics for errors after deployment
- Consider adding Cloudflare Workers Logs for debugging
- WebSub implementation remains deferred
