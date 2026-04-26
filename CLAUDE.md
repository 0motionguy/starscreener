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

## Critical Conventions
- **Data reads MUST go through the data-store.** Server components / route handlers call the per-source `refreshXxxFromStore()` (async) once at the top, then sync getters in the rest of the file return whatever's in the in-memory cache. Each refresh hook has internal 30s rate-limit + in-flight dedupe so calling it on every render is cheap. Pattern reference: [src/lib/trending.ts:refreshTrendingFromStore](src/lib/trending.ts) and [src/app/page.tsx](src/app/page.tsx). Plan + provisioning: [tasks/data-api.md](tasks/data-api.md).
- **Collectors dual-write file + Redis** during transition via [scripts/_data-store-write.mjs](scripts/_data-store-write.mjs). When `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are missing, the Redis write is skipped silently and the file write stays — graceful degradation by design.
- **Collectors run in `direct` mode**, NOT `api` mode. Vercel's serverless filesystem is ephemeral — API-mode writes vanish. GitHub Actions writes locally to `.data/*.jsonl` and `git push` from the workflow. See `.github/workflows/collect-twitter.yml` (committed fix `edf99d2`).
- **Twitter** uses Apify `apidojo~tweet-scraper` actor. Cookie-based providers are dead post-2026 anti-bot. Bundle = 4 queries per repo for tier-1 coverage.
- **Append-only JSONL.** Each scan adds new lines, never replaces. Aggregator dedupes downstream.
- **Production page** renders skeleton SSR + client hydration. Fresh data only appears after JS execution.

## Common Tasks
- Dev: `npm run dev` (Turbopack)
- Lint/typecheck: `npm run lint` / `npm run typecheck`
- Tests: `npm test` (where present in `scripts/__tests__/` and route-level)
- Local scrape: `npm run scrape:twitter` / `:reddit` / `:hn` / `:bsky` / `:ph` / `:devto`
- Trigger workflow: `gh workflow run collect-twitter.yml`
- Build graph: `code-review-graph build` (run once after major refactor; auto-updates on Edit/Write/Bash via project hook)
- Verify Redis data-store: `npm run verify:data-store` (requires `REDIS_URL` for Railway, OR `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for Upstash)

## Where to Look First
- New here? `docs/ARCHITECTURE.md`
- Data layer (Redis-backed)? [tasks/data-api.md](tasks/data-api.md) — full plan, provisioning steps, phased roadmap
- Ingest pipeline? `docs/INGESTION.md` + `docs/TWITTER_SIGNAL_LAYER.md`
- Deploy issues? `docs/DEPLOY.md`
- Adding a signal source? `docs/SOURCE_DISCOVERY.md`

## Anti-Patterns Already Burned
- Don't switch Twitter collector back to API mode — it silently fails on Vercel.
- Don't mock Redis in tests that exercise scoring logic — 2026-Q1 incident.
- Don't use cookie-based Twitter scrapers — dead provider.
- Don't `readFileSync(process.cwd(), "data", ...)` for new data sources — use the data-store. The reason filesystem reads worked at all is that bundled JSON is baked into each Vercel deploy; that coupled data freshness to deploys and caused 17-34 deploys/day from data churn alone (commit `87e3f4e`, 2026-04-26).
- Don't add a new collector that only writes to a file — wire `writeDataStore("<slug>", payload)` from [scripts/_data-store-write.mjs](scripts/_data-store-write.mjs) so the write lands in Redis too. File mirror is allowed during transition but Redis is the truth.

## References
- Plans: `~/.claude/plans/`
- Memory: `~/.claude/projects/c--Users-mirko-OneDrive-Desktop-STARSCREENER/memory/MEMORY.md`
