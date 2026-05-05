---
last-verified: 2026-05-05
---

# AGENTS.md

Cross-tool agent instructions for STARSCREENER / trendingrepo.com.

This file mirrors the project's authoritative agent instructions in `CLAUDE.md`
for tools that read AGENTS.md (Cursor, Codex CLI, Vercel auto-AGENTS.md
ecosystem). For Claude Code, the canonical file is `CLAUDE.md`.

## Front door

- `docs/INDEX.md` -- canonical map of every doc in the repo, classified by trust
- `docs/OPERATOR.md` -- operator situational awareness (start here)
- `docs/_generated/health-board.md` -- auto-generated platform health board
- `tasks/HANDOFF-2026-05-05-EOD.md` -- next-session entry point (EOD handoff)
- `docs/ENGINE.md` -- workflow + cron + key inventory (rewritten from current code 2026-05-05; 85 workflows + 51 fetchers)
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
- **Auth:** Cookie-based admin session (see `e2a0908`)
- **Payments:** Stripe (configured, not billed yet)
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
  junction workaround in `next.config.ts:12-25`. CSS edits can also be
  silently reverted by OneDrive sync -- see memory note
  `project_onedrive_dev_server_block`.

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
  `.github/workflows/collect-twitter.yml` (committed fix `edf99d2`).
- **Twitter** uses Nitter as the current provider (see
  `docs/TWITTER_SIGNAL_LAYER.md` and `scripts/check-nitter-health.mjs` for
  the live health probe). Cookie-based scrapers and the previous Apify
  `apidojo~tweet-scraper` path are dead/deprecated -- do not revert.
- **Append-only JSONL.** Each scan adds new lines, never replaces. Aggregator
  dedupes downstream.
- **Home page (`/`) is ISR-cached at 30 min** (`revalidate=1800`). Bundled
  JSON seeds the cold start; client refresh hooks repopulate the in-memory
  cache on navigation. Don't expect fresh data on first paint.

## Where to look first

(quoted from CLAUDE.md "Where to Look First")

- **Operator situational-awareness doc (start here)** -- `docs/OPERATOR.md`:
  TL;DR for a fresh session, current production state, audit-2026-05-04
  followup status, hourly+minute workflow rotation, image-coverage map,
  what-shipped-vs-open. Operator-only -- never linked from any public route.
- **Engine map (85 workflows + every API key + every cron + pool architecture)**
  -- `docs/ENGINE.md`: read FIRST when you need to know what runs where, on
  what cadence, with which keys. Rewritten from current code 2026-05-05.
- **Site wire map (every route -> data -> collector -> external API)** --
  `docs/SITE-WIREMAP.md`: top-down menu walk. Use when a page is broken to
  trace it back to the failing collector. Refreshed 2026-05-02.
- New here? `docs/ARCHITECTURE.md`
- Data layer (Redis-backed)? `tasks/data-api.md` -- full plan, provisioning
  steps, phased roadmap
- Ingest pipeline? `docs/INGESTION.md` + `docs/TWITTER_SIGNAL_LAYER.md`
- Deploy issues? `docs/DEPLOY.md`
- Adding a signal source? `docs/SOURCE_DISCOVERY.md`
- See `apps/trendingrepo-worker/` referenced in code? Sister Railway service
  hosting 51 fetchers (MCP registries, funding sources, scoring) -- lives in
  worktree branches not yet in main. See memory `project_trendingrepo_worker.md`.

## Anti-patterns already burned

(quoted from CLAUDE.md "Anti-Patterns Already Burned")

- Don't switch Twitter collector back to API mode -- it silently fails on
  Vercel.
- Don't mock Redis in tests that exercise scoring logic -- 2026-Q1 incident.
- Don't use cookie-based Twitter scrapers -- dead provider.
- Don't `readFileSync(process.cwd(), "data", ...)` for new data sources --
  use the data-store. Bundled JSON is baked into each Vercel deploy; that
  coupled data freshness to deploys and caused 17-34 deploys/day from data
  churn alone (commit `87e3f4e`, 2026-04-26).
- Don't add a new collector that only writes to a file -- wire
  `writeDataStore("<slug>", payload)` from
  `scripts/_data-store-write.mjs` so the write lands in Redis too. File
  mirror is allowed during transition but Redis is the truth.
- **Kimi For Coding endpoint requires `stream: true`.** Non-stream calls
  hang silently (HTTP 000, fetch fails). The wrapper at
  `apps/trendingrepo-worker/src/fetchers/consensus-analyst/llm.ts` streams
  + accumulates; don't revert to non-streaming. Same endpoint also enforces
  a User-Agent allowlist (`claude-cli`, `RooCode`, `Kilo-Code`) -- the
  OpenAI SDK's default UA gets `access_terminated_error`.
- **Don't sequential-loop the consensus-analyst sweep.** K2.6 is ~80s per
  call; sequential 14 = 18 min, blowing the hourly slot. Use the bounded-
  concurrency queue pattern in
  `apps/trendingrepo-worker/src/fetchers/consensus-analyst/index.ts`
  (concurrency 4 -> ~5 min wall).
- **Parallel-session merges silently steal staged work.** When 4 agents work
  the same workspace concurrently, `git add` + `git commit` interleave:
  agent A's `git add file-a` lands in agent B's `git commit` and vice versa.
  Survival pattern: always `git add <SPECIFIC-FILE>` (NEVER `git add -A` or
  `git add .`), and `git commit -m "wip(...)"` IMMEDIATELY after each Write
  so the commit boundary is durable. Staging is shared mutable state;
  commits are durable history. Learned 2026-05-02 across 4 parallel agent
  dispatch.
- **Audit premises must be verified before believing.** Recalled facts about
  branch state are hypotheses (M6: memory is suspect) -- always grep `main`
  for the markers BEFORE planning a cherry-pick. Cherry-pick plans built on
  un-verified branch state will fail.

## Path-scoped instructions

The following CLAUDE.md files load on-demand based on which subdirectory you
edit. Tools that don't support per-directory CLAUDE.md should still respect
the conventions in these:

- `src/app/api/cron/CLAUDE.md` -- cron route conventions
- `src/lib/CLAUDE.md` -- data-store + token pool
- `src/lib/redis/CLAUDE.md` -- Redis key registry rules
- `apps/trendingrepo-worker/CLAUDE.md` -- sister Railway service
- `.github/workflows/CLAUDE.md` -- GH Actions conventions
- `apps/trendingrepo-worker/src/fetchers/CLAUDE.md` -- worker fetcher conventions (Wave 5)
- `scripts/CLAUDE.md` -- collector + maintenance script conventions (Wave 5)
- `docs/CLAUDE.md` -- doc frontmatter + freshness rules (Wave 5)

## Common tasks

(quoted from CLAUDE.md "Common Tasks")

- Dev: `npm run dev` (Turbopack, port 3023)
- Lint: `npm run lint` / `npm run lint:guards` (the meta-lint catches
  Zod-on-mutating-routes, error envelopes, runtime drift)
- Typecheck: `npm run typecheck` (run before every commit per ICM Motion
  "Verification Before Done")
- Tests: `npm test` runs node:test + tsx + vitest in serial. Subsuites:
  `npm run test:hooks` / `:hooks:watch` (vitest), `npm run test:e2e` /
  `:e2e:ui` (Playwright)
- Build/start: `npm run build` / `npm start` (production path)
- Local collectors: `npm run collect:twitter` (Apify, NOT scrape:twitter),
  `npm run scrape:reddit` / `:hn` / `:bsky` / `:ph` / `:devto` /
  `:lobsters` / `:arxiv` / `:npm`
- Intake: `npm run ingest:arxiv-cited` (intake pipeline for arXiv-cited repos)
- Trigger workflow: `gh workflow run collect-twitter.yml`
- Build graph: `code-review-graph build` (auto-runs via project hook on
  Edit/Write/Bash; pre-commit hook also runs `code-review-graph detect-changes`)
- Verify Redis data-store: `npm run verify:data-store` (requires `REDIS_URL`
  for Railway, OR `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for
  Upstash)
