# AGENTS.md

Cross-tool agent instructions for STARSCREENER / trendingrepo.com.

This file mirrors the project's authoritative agent instructions in `CLAUDE.md`
for tools that read AGENTS.md (Cursor, Codex CLI, Vercel auto-AGENTS.md
ecosystem). For Claude Code, the canonical file is `CLAUDE.md`.

## Front door

- `docs/INDEX.md` -- canonical map of every doc in the repo, classified by trust
- `docs/OPERATOR.md` -- operator situational awareness (start here)
- `docs/ENGINE.md` -- workflow + cron + key inventory (rewritten from current code 2026-05-05; 88 workflows + 44 active worker fetchers in FETCHERS[], 47 with index.ts on disk)
- `docs/SITE-WIREMAP.md` -- route -> data -> collector trace

## Tech stack

(quoted from CLAUDE.md)

- **Framework:** Next.js 15 (App Router, Turbopack, RSC + client islands)
- **Language:** TypeScript 5 strict
- **UI:** React 19, Tailwind 4, Recharts (charts), Framer Motion (animation),
  Zustand (client state)
- **Data:** Redis (Railway-native via `ioredis` OR Upstash REST) is the source
  of truth for 30 cron-driven payloads (`data/*.json`) via
  `src/lib/data-store.ts` -- three-tier read (Redis -> bundled file ->
  in-memory last-known-good). Picks the backend by URL scheme: `redis://` /
  `rediss://` -> ioredis (TCP), `https://` -> Upstash REST. Set `REDIS_URL`
  (Railway) or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
  (Upstash) -- never both. `.data/*.jsonl` (Twitter scans, append-only logs)
  still git-committed via collector workflows.
- **Validation:** Zod on all API boundaries
- **Auth:** Cookie-based admin session
- **Deploy:** Vercel main = production. GitHub Actions cron for scrapers (3h default).

## Setup

(quoted from CLAUDE.md)

- `npm install` (Node 22.x -- pinned via `engines` in package.json)
- Copy `.env.example` to `.env.local`. Required for prod: `GITHUB_TOKEN`,
  `CRON_SECRET`. Pick exactly ONE Redis pair: `REDIS_URL` (Railway) OR
  `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash) -- never
  both. Without either, the data-store gracefully falls back to bundled JSON
  + memory.
- Windows + OneDrive gotcha: dev server hits ENOENT loops without the `.next`
  junction workaround in `next.config.ts:12-25`.

## Critical conventions

(quoted from CLAUDE.md "Critical Conventions")

- **Data reads MUST go through the data-store.** Server components / route
  handlers call the per-source `refreshXxxFromStore()` (async) once at the
  top, then sync getters in the rest of the file return whatever's in the
  in-memory cache. Each refresh hook has internal 30s rate-limit + in-flight
  dedupe so calling it on every render is cheap. Pattern reference:
  `src/lib/trending.ts:refreshTrendingFromStore` and `src/app/page.tsx`. Plan
  + provisioning: `tasks/data-api.md`.
- **Collectors dual-write file + Redis** during transition via
  `scripts/_data-store-write.mjs`. When `UPSTASH_REDIS_REST_URL` +
  `UPSTASH_REDIS_REST_TOKEN` are missing, the Redis write is skipped silently
  and the file write stays -- graceful degradation by design.
- **Collectors run in `direct` mode**, NOT `api` mode. Vercel's serverless
  filesystem is ephemeral -- API-mode writes vanish. GitHub Actions writes
  locally to `.data/*.jsonl` and `git push` from the workflow. See
  `.github/workflows/collect-twitter.yml`.
- **Twitter** uses Nitter as the current provider (see
  `docs/TWITTER_SIGNAL_LAYER.md` and `scripts/check-nitter-health.mjs` for
  the live health probe). Cookie-based scrapers and the previous Apify
  `apidojo~tweet-scraper` path are dead/deprecated -- do not revert.
- **Append-only JSONL.** Each scan adds new lines, never replaces. Aggregator
  dedupes downstream.
- **Home page (`/`) is ISR-cached at 30 min** (`revalidate=1800`). Bundled
  JSON seeds the cold start; client refresh hooks repopulate the in-memory
  cache on navigation. Don't expect fresh data on first paint.

## Anti-patterns already burned

(quoted from CLAUDE.md "Anti-Patterns Already Burned")

- Don't switch Twitter collector back to API mode -- it silently fails on
  Vercel.
- Don't mock Redis in tests that exercise scoring logic -- 2026-Q1 incident.
- Don't use cookie-based Twitter scrapers -- dead provider.
- Don't `readFileSync(process.cwd(), "data", ...)` for new data sources --
  use the data-store. Bundled JSON is baked into each Vercel deploy; that
  coupled data freshness to deploys and caused 17-34 deploys/day from data
  churn alone.
- Don't add a new collector that only writes to a file -- wire
  `writeDataStore("<slug>", payload)` from
  `scripts/_data-store-write.mjs` so the write lands in Redis too. File
  mirror is allowed during transition but Redis is the truth.
- **Kimi For Coding endpoint requires `stream: true`.** Non-stream calls
  hang silently (HTTP 000, fetch fails). Same endpoint also enforces a
  User-Agent allowlist (`claude-cli`, `RooCode`, `Kilo-Code`) -- the OpenAI
  SDK's default UA gets `access_terminated_error`.
- **Parallel-session merges silently steal staged work.** Always
  `git add <SPECIFIC-FILE>` (NEVER `git add -A` or `git add .`), and
  `git commit -m "wip(...)"` IMMEDIATELY after each Write so the commit
  boundary is durable.

## Path-scoped instructions

The following CLAUDE.md files load on-demand based on which subdirectory you
edit. Tools that don't support per-directory CLAUDE.md should still respect
the conventions in these:

- `src/app/api/cron/CLAUDE.md` -- cron route conventions
- `src/lib/CLAUDE.md` -- data-store + token pool
- `src/lib/redis/CLAUDE.md` -- Redis key registry rules
- `apps/trendingrepo-worker/CLAUDE.md` -- sister Railway service
- `.github/workflows/CLAUDE.md` -- GH Actions conventions

## Common tasks

(quoted from CLAUDE.md "Common Tasks")

- Dev: `npm run dev` (Turbopack, port 3023)
- Lint: `npm run lint` / `npm run lint:guards`
- Typecheck: `npm run typecheck` (run before every commit)
- Tests: `npm test` runs node:test + tsx + vitest in serial
- Build/start: `npm run build` / `npm start`
- Verify Redis data-store: `npm run verify:data-store`
