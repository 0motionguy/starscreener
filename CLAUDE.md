# SESSION OPENING PROTOCOL — MANDATORY BEFORE ANY OTHER ACTION

When you start a session in this repository, the FIRST steps are
not optional:

1. Read this entire CLAUDE.md
2. Read docs/ENGINE.md and docs/SITE-WIREMAP.md
3. Read docs/AUDIT-2026-05-04.md and docs/forensic/00-INDEX.md
4. Read tasks/CURRENT-SPRINT.md to know in-flight work
5. Read tasks/BACKLOG.md for deferred items
6. Run: `npm run freshness:check`
7. If any source past freshness budget: REPAIR before features.

Sessions that propose new work without doing 1-7 are operating on
stale assumptions. The audit found this is the root cause of the
"engine drift" problem.

# STARSCREENER

Real-time trend-discovery scanner. Aggregates GitHub stars, Twitter buzz, Reddit/HN/Bluesky/ProductHunt/DevTo signals, computes scoring + classification, surfaces breakout repos before they go mainstream.

## Tech Stack
- **Framework:** Next.js 15 (App Router, Turbopack, RSC + client islands)
- **Language:** TypeScript 5 strict
- **UI:** React 19, Tailwind 4, Recharts (charts), Framer Motion (animation), Zustand (client state)
- **Data:** Redis (Railway-native via `ioredis` OR Upstash REST) is the source of truth for 30 cron-driven payloads (`data/*.json`) via [src/lib/data-store.ts](src/lib/data-store.ts) — three-tier read (Redis → bundled file → in-memory last-known-good). Picks the backend by URL scheme: `redis://` / `rediss://` → ioredis (TCP), `https://` → Upstash REST. Set `REDIS_URL` (Railway) or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash) — never both. `.data/*.jsonl` (Twitter scans, append-only logs) still git-committed via collector workflows.
- **Validation:** Zod on all API boundaries
- **Auth:** Cookie-based admin session (see `e2a0908`)
- **Payments:** Stripe (configured, not billed yet)
- **Deploy:** Vercel main = production. GitHub Actions cron for scrapers (3h interval default).

## Layout
- `src/app/` — App Router routes (`/twitter`, `/ideas`, `/funding`, `/admin`, etc.)
- `src/components/` — UI components, grouped by domain (ideas/, reactions/, ...)
- `bin/` `cli/` `scripts/` — collector entrypoints (`collect-twitter`, `collect-funding`, ...)
- `.data/` — git-tracked JSONL scan output (whitelisted in `.gitignore`)
- `mcp/` — MCP server source for code-review-graph integration
- `docs/` — `ARCHITECTURE.md`, `DATABASE.md`, `DEPLOY.md`, `INGESTION.md`, `TWITTER_SIGNAL_LAYER.md`, `SOURCE_DISCOVERY.md`, plus protocols/ and review/ subdirs

## Setup
- `npm install` (Node 22.x — pinned via `engines` in package.json)
- Copy `.env.example` to `.env.local`. Required for prod: `GITHUB_TOKEN`, `CRON_SECRET`. Pick exactly ONE Redis pair: `REDIS_URL` (Railway) OR `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash) — never both. Without either, the data-store gracefully falls back to bundled JSON + memory.
- Windows + OneDrive gotcha: dev server hits ENOENT loops without the `.next` junction workaround in `next.config.ts:12-25`. CSS edits can also be silently reverted by OneDrive sync — see memory note `project_onedrive_dev_server_block`.

## Critical Conventions
- **Data reads MUST go through the data-store.** Server components / route handlers call the per-source `refreshXxxFromStore()` (async) once at the top, then sync getters in the rest of the file return whatever's in the in-memory cache. Each refresh hook has internal 30s rate-limit + in-flight dedupe so calling it on every render is cheap. Pattern reference: [src/lib/trending.ts:refreshTrendingFromStore](src/lib/trending.ts) and [src/app/page.tsx](src/app/page.tsx). Plan + provisioning: [tasks/data-api.md](tasks/data-api.md).
- **Collectors dual-write file + Redis** during transition via [scripts/_data-store-write.mjs](scripts/_data-store-write.mjs). When `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are missing, the Redis write is skipped silently and the file write stays — graceful degradation by design.
- **Collectors run in `direct` mode**, NOT `api` mode. Vercel's serverless filesystem is ephemeral — API-mode writes vanish. GitHub Actions writes locally to `.data/*.jsonl` and `git push` from the workflow. See `.github/workflows/collect-twitter.yml` (committed fix `edf99d2`).
- **Twitter** uses Apify `apidojo~tweet-scraper` actor. Cookie-based providers are dead post-2026 anti-bot. Apify actor runs 4 query templates per tracked repo per scan.
- **Append-only JSONL.** Each scan adds new lines, never replaces. Aggregator dedupes downstream.
- **Home page (`/`) is ISR-cached at 30 min** (`revalidate=1800`). Bundled JSON seeds the cold start; client refresh hooks repopulate the in-memory cache on navigation. Don't expect fresh data on first paint.

## Common Tasks
- Dev: `npm run dev` (Turbopack, port 3023)
- Lint: `npm run lint` / `npm run lint:guards` (the meta-lint catches Zod-on-mutating-routes, error envelopes, runtime drift)
- Typecheck: `npm run typecheck` (run before every commit per ICM Motion "Verification Before Done")
- Tests: `npm test` runs node:test + tsx + vitest in serial. Subsuites: `npm run test:hooks` / `:hooks:watch` (vitest), `npm run test:e2e` / `:e2e:ui` (Playwright)
- Build/start: `npm run build` / `npm start` (production path)
- Local collectors: `npm run collect:twitter` (Apify, NOT scrape:twitter), `npm run scrape:reddit` / `:hn` / `:bsky` / `:ph` / `:devto` / `:lobsters` / `:arxiv` / `:npm`
- Intake: `npm run ingest:arxiv-cited` (intake pipeline for arXiv-cited repos)
- Trigger workflow: `gh workflow run collect-twitter.yml`
- Build graph: `code-review-graph build` (auto-runs via project hook on Edit/Write/Bash; pre-commit hook also runs `code-review-graph detect-changes`)
- Verify Redis data-store: `npm run verify:data-store` (requires `REDIS_URL` for Railway, OR `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for Upstash)

## Where to Look First
- **Operator situational-awareness doc (start here)** → [docs/OPERATOR.md](docs/OPERATOR.md) — TL;DR for a fresh session, current production state, audit-2026-05-04 followup status, hourly+minute workflow rotation, image-coverage map, what-shipped-vs-open. Operator-only — never linked from any public route. Refreshed at the end of every "go" wave.
- **Engine map (62 workflows + every API key + every cron + pool architecture)** → [docs/ENGINE.md](docs/ENGINE.md) — read FIRST when you need to know what runs where, on what cadence, with which keys. Refreshed 2026-05-02.
- **Site wire map (every route → its data → collector → external API)** → [docs/SITE-WIREMAP.md](docs/SITE-WIREMAP.md) — top-down menu walk. Use when a page is broken to trace it back to the failing collector. Refreshed 2026-05-02.
- New here? `docs/ARCHITECTURE.md`
- Data layer (Redis-backed)? [tasks/data-api.md](tasks/data-api.md) — full plan, provisioning steps, phased roadmap
- Ingest pipeline? `docs/INGESTION.md` + `docs/TWITTER_SIGNAL_LAYER.md`
- Deploy issues? `docs/DEPLOY.md`
- Adding a signal source? `docs/SOURCE_DISCOVERY.md`
- See `apps/trendingrepo-worker/` referenced in code? Sister Railway service hosting ~37 fetchers (MCP registries, funding sources, scoring) — lives in worktree branches not yet in main. See memory `project_trendingrepo_worker.md`.

## Anti-Patterns Already Burned
- Don't switch Twitter collector back to API mode — it silently fails on Vercel.
- Don't mock Redis in tests that exercise scoring logic — 2026-Q1 incident.
- Don't use cookie-based Twitter scrapers — dead provider.
- Don't `readFileSync(process.cwd(), "data", ...)` for new data sources — use the data-store. The reason filesystem reads worked at all is that bundled JSON is baked into each Vercel deploy; that coupled data freshness to deploys and caused 17-34 deploys/day from data churn alone (commit `87e3f4e`, 2026-04-26).
- Don't add a new collector that only writes to a file — wire `writeDataStore("<slug>", payload)` from [scripts/_data-store-write.mjs](scripts/_data-store-write.mjs) so the write lands in Redis too. File mirror is allowed during transition but Redis is the truth.
- **Kimi For Coding endpoint requires `stream: true`.** Non-stream calls hang silently (HTTP 000, fetch fails). The wrapper at [apps/trendingrepo-worker/src/fetchers/consensus-analyst/llm.ts](apps/trendingrepo-worker/src/fetchers/consensus-analyst/llm.ts) streams + accumulates; don't revert to non-streaming. Same endpoint also enforces a User-Agent allowlist (`claude-cli`, `RooCode`, `Kilo-Code`) — sending the OpenAI SDK's default UA gets `access_terminated_error`.
- **Don't sequential-loop the consensus-analyst sweep.** K2.6 is ~80s per call; sequential 14 = 18 min, blowing the hourly slot. Use the bounded-concurrency queue pattern in [consensus-analyst/index.ts](apps/trendingrepo-worker/src/fetchers/consensus-analyst/index.ts) (concurrency 4 → ~5 min wall).

## References
- Plans: `~/.claude/plans/`
- Memory: `~/.claude/projects/c--Users-mirko-OneDrive-Desktop-STARSCREENER/memory/MEMORY.md`
