# STARSCREENER — Repo Overview

Onboarding for a new contributor. One page. Read this first, then dive into the deep docs linked at the bottom.

## What this is

Real-time trend-discovery scanner. Aggregates GitHub stars, Twitter buzz, Reddit / HN / Bluesky / ProductHunt / DevTo / Lobsters / arXiv / npm / Product-Hunt signals, scores + classifies repos, and surfaces breakout candidates before they go mainstream.

Two deployable surfaces live in this monorepo:

1. **Next.js app** (`src/app/`) — operator UI + public read-only routes. Vercel main = production.
2. **trendingrepo-worker** (`apps/trendingrepo-worker/`) — sister Railway service hosting ~37 background fetchers (MCP registries, funding sources, scoring, consensus analyst). Independent build / deploy. See its own README in that subdir.

## Tech stack

- **Framework:** Next.js 15 (App Router, Turbopack, RSC + client islands)
- **Language:** TypeScript 5 strict
- **UI:** React 19, Tailwind 4, Recharts, Framer Motion, Zustand
- **Data store:** Redis (Railway `redis://` via `ioredis` OR Upstash REST) — source of truth for ~30 cron-driven payloads. Three-tier read in [src/lib/data-store.ts](../src/lib/data-store.ts): Redis → bundled JSON → in-memory last-known-good.
- **Validation:** Zod on all API boundaries (enforced by `npm run lint:guards`)
- **Auth:** cookie-based admin session
- **Payments:** Stripe configured (not billed yet)
- **Deploy:** Vercel (main → prod) + GitHub Actions cron (3h default) + Railway (worker)
- **Node:** 22.x (pinned via `engines`)

## Repo layout

```
src/
  app/                 App Router routes (/twitter, /ideas, /funding, /admin, /reddit, /hackernews, /bluesky, /devto, /lobsters, /producthunt, ...)
  components/          UI components grouped by domain (ideas/, reactions/, news/, submissions/, ...)
  lib/                 Server libs — data-store, scoring, freshness, twitter service, env guards
bin/ cli/ scripts/     Collector entrypoints (collect-twitter, collect-funding, scrape-* per source)
.data/                 git-tracked JSONL scan output (whitelisted in .gitignore)
data/                  bundled JSON snapshots seeding cold starts (writes happen via Redis, NOT here)
apps/
  trendingrepo-worker/ Railway sister service — fetchers, consensus analyst, scoring jobs
mcp/                   MCP server source for code-review-graph integration
docs/                  ARCHITECTURE / DATABASE / DEPLOY / INGESTION / TWITTER_SIGNAL_LAYER / SOURCE_DISCOVERY / OPERATOR / ENGINE / SITE-WIREMAP, plus protocols/ and review/ subdirs
.github/workflows/     ~62 GitHub Actions workflows — scheduled scrapers, health-watch, sentry verify, refresh jobs
tasks/                 BACKLOG.md, CURRENT-SPRINT.md, data-api.md (data-layer plan)
```

## Data flow (one paragraph)

GitHub Actions cron jobs run collectors (`scripts/scrape-*`, `scripts/collect-*`) on a staggered hourly+minute rotation. Each collector runs in **direct mode**: it writes append-only JSONL to `.data/*.jsonl`, dual-writes the latest payload to Redis via [scripts/_data-store-write.mjs](../scripts/_data-store-write.mjs), and `git push`es the JSONL change. The Next.js app reads via `refreshXxxFromStore()` hooks (Redis → bundled JSON → memory fallback). Public pages render from the in-memory cache; ISR = 30 min on `/`. **Never** `readFileSync(process.cwd(), "data", ...)` for new sources — always go through the data-store. **Never** switch Twitter back to API mode (Vercel filesystem is ephemeral; writes vanish).

## Run dev

```bash
npm install                    # Node 22.x required
cp .env.example .env.local     # then fill GITHUB_TOKEN, CRON_SECRET; pick ONE Redis pair (REDIS_URL OR UPSTASH_*)
npm run dev                    # Turbopack on port 3023
```

OneDrive gotcha: `next.config.ts:12-25` has a `.next` junction workaround. CSS edits can be silently reverted by OneDrive sync — see memory note `project_onedrive_dev_server_block`.

## Common scripts

```bash
npm run dev                    # Turbopack, port 3023
npm run build && npm start     # production path
npm run lint                   # eslint
npm run lint:guards            # meta-lint: Zod on mutating routes, error envelopes, runtime drift
npm run typecheck              # strict tsc — run before EVERY commit
npm test                       # node:test + tsx + vitest in serial
npm run test:hooks             # vitest only
npm run test:e2e               # Playwright
npm run collect:twitter        # Apify apidojo~tweet-scraper
npm run scrape:reddit          # also :hn :bsky :ph :devto :lobsters :arxiv :npm
npm run verify:data-store      # sanity-check Redis connectivity
```

## Tests

- **vitest** — colocated under `src/**/__vitest__/*.test.ts` and `src/**/__tests__/*.test.tsx`. Fast unit + component tests. Entry: `npm run test:hooks`.
- **node:test + tsx** — older suite for collector / scoring logic. Entry: included in `npm test`.
- **Playwright** — end-to-end against running dev server. Entry: `npm run test:e2e` (or `:e2e:ui`).

`npm test` runs all three in serial. CI runs the same.

## Where to look first

- **Operator situational-awareness** → [docs/OPERATOR.md](OPERATOR.md) — TL;DR, current prod state, what shipped vs open
- **Engine map (62 workflows × keys × cron × pools)** → [docs/ENGINE.md](ENGINE.md)
- **Site wire map (route → data → collector → external API)** → [docs/SITE-WIREMAP.md](SITE-WIREMAP.md)
- New here on architecture? [docs/ARCHITECTURE.md](ARCHITECTURE.md)
- Data layer plan? [tasks/data-api.md](../tasks/data-api.md)
- Ingest pipeline? [docs/INGESTION.md](INGESTION.md) + [docs/TWITTER_SIGNAL_LAYER.md](TWITTER_SIGNAL_LAYER.md)
- Adding a signal source? [docs/SOURCE_DISCOVERY.md](SOURCE_DISCOVERY.md)
- Deploy issues? [docs/DEPLOY.md](DEPLOY.md)

## Conventions that bite

- **Direct mode only** for collectors. API mode silently fails on Vercel.
- **`git add <specific-file>`** only — never `-A` or `.` (parallel-session merge anti-pattern).
- **Mutating API routes need Zod** — `lint:guards` enforces.
- **Data reads via data-store**, not `readFileSync`.
- **Append-only JSONL** for scans. Aggregator dedupes downstream.
- **Run `npm run typecheck` before every commit.** If red, revert.

Full anti-patterns list: [CLAUDE.md](../CLAUDE.md) → "Anti-Patterns Already Burned".
