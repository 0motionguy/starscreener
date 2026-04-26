# Phase 3 — Worker Consolidation + Source Coverage

**Goal:** consolidate all collectors into the Railway worker (kill the 12 GH-Actions cron workflows) AND land Phase 3 source coverage (engagement composite, GH Events firehose, funding sources) on the worker. Defer Phase 3.2 ClickHouse historical depth to a separate workstream.

**Effort:** 28-32 hours (3-4 days), 2 sessions to ship cleanly.
**Prereq:** Phase 1B + Phase 2 shipped (commits `0962f1c` + earlier on main).

## Why consolidate (decision rationale)

- Sub-minute latency is THE moat per `starscreener-inspection/MOAT.md` — GH Actions can't reliably hit `*/1 * * * *` (cron min syntax + queue overhead). A real Node worker can.
- Today's `workflow_dispatch` queue is jammed for HOURS at a time — directly observed in the Phase 1B CI verification attempts. Workers don't have this failure mode.
- Single debug surface (one Node process) vs grepping across 12 workflow YAMLs.
- Railway is already billed (REDIS_URL service running). Incremental cost ~$5/mo for the worker, no new vendor.
- Per-customer webhook delivery in Phase 4 (monetization) is much cleaner from a worker than per-request Lambdas.

**Trade-off accepted:** worker becomes a SPOF (vs distributed GH runners today). Mitigated by keeping GH-Actions cron workflows ALIVE during Phase B; only deprecate in Phase D after 24h of green production.

## Worker scaffold gaps (verified by audit 2026-04-26)

The scaffold at `apps/trendingrepo-worker/` exists but has 4 known gaps that must be fixed before it can replace anything:

1. **Root build blocked** — root `tsconfig.json:25` includes `**/*.ts`, which compiles `apps/trendingrepo-worker/src/lib/http.ts:70` and clashes with the worker's own undici types. Both `npm run typecheck` and `npm run build` fail.
2. **Cron flag is no-op** — `apps/trendingrepo-worker/src/index.ts:28` starts a healthcheck and waits forever when invoked with `--cron` (per `railway.json:8`). No scheduler is wired.
3. **Fetchers are stubs** — every file under `apps/trendingrepo-worker/src/fetchers/*/index.ts` throws `"Not Implemented"` at line 12. GH/Reddit/HN/Bluesky/PH/devto/HuggingFace/MCP all stubbed.
4. **Redis key mismatch** — worker writes `ss:data:v1:trending:${type}` (typed); app reads `ss:data:v1:trending` (bare slug) via `src/lib/data-store.ts`. Worker output never reaches the app.

## Execution phases (do in order — each lands as a separate PR)

### Phase A — Fix the scaffold (~4 hours, 1 PR)

| | Action | File(s) |
|---|---|---|
| A1 | Add `"apps"` to root tsconfig `exclude` | `tsconfig.json:25` |
| A2 | Wire a real scheduler (suggest `croner`) | `apps/trendingrepo-worker/src/index.ts:28`, new `src/schedule.ts` |
| A3 | Align Redis publish keys with `data-store.ts` contract (bare slug) | `apps/trendingrepo-worker/src/lib/publish.ts:45` |
| A4 | Implement ONE pilot fetcher (HN — simplest, no auth) end-to-end | `apps/trendingrepo-worker/src/fetchers/hackernews/index.ts` |
| A5 | Update `railway.json` + `Dockerfile` if `dist/index.js --cron` needs adjustments | `apps/trendingrepo-worker/{railway.json,Dockerfile}` |
| A6 | **Verification gate:** deploy to Railway, see worker-fetched data appear in app within one cron tick |

### Phase B — Port the 12 collectors (~10-12 hours, 1 PR per group of 4)

Three parallel-subagent groups (worktree isolation):

- **Group 1 — signals:** trending, hot-collections, deltas, recent-repos (currently `scripts/scrape-trending.mjs`)
- **Group 2 — social:** reddit, hackernews, bluesky, devto, lobsters, producthunt (currently 6 scripts)
- **Group 3 — enrichment:** repo-profiles, repo-metadata, npm, collection-rankings, trustmrr, funding-news (currently 5 scripts)

Per-fetcher pattern:
- Read `scripts/scrape-<source>.mjs` end-to-end
- Port logic into `apps/trendingrepo-worker/src/fetchers/<source>/index.ts`
- REUSE shared helpers (`scripts/_fetch-json.mjs`, `_devto-shared.mjs`, etc.) — copy into `apps/trendingrepo-worker/src/lib/` to keep worker self-contained
- REUSE Phase 2 env conventions (`GH_TOKEN_POOL`, `DEVTO_API_KEYS`, `PRODUCTHUNT_TOKENS`, `REDIS_URL`)
- Wire into `apps/trendingrepo-worker/src/schedule.ts`
- Match cadence from `.github/workflows/scrape-*.yml`
- Write to Redis via `publish` (using bare-slug keys after Phase A3)
- **DO NOT delete `scripts/scrape-*.mjs`** — workflows still call them until Phase D

### Phase C — Add Phase 3 source coverage on the worker (~12 hours, 1 PR)

#### 3.1 — Engagement composite scoring
- `apps/trendingrepo-worker/src/jobs/composite-score.ts` — pure 0-100 score from existing signals (HN points, Reddit upvotes, Bluesky reposts, DEV reactions, npm downloads 7d, GH stars-velocity, PH votes)
- Hourly run, write to `ss:data:v1:engagement-composite`
- App-side reader: `src/lib/engagement-composite.ts` (sync getter + `refreshFromStore()` hook)
- Public route: `/api/scoring/engagement`
- Methodology in `docs/SCORING.md` (transparency lever vs Trendshift's opaque algo)

#### 3.3 — GH Events firehose for sub-minute latency
- `apps/trendingrepo-worker/src/fetchers/github-events/index.ts` — watchlist tier (top-50 repos) polled every 5 min
- Reuses Phase 2A token pool (10 PATs absorb the load)
- Writes to `ss:data:v1:github-events:<repoId>`
- Reuses core logic from `src/lib/pipeline/ingestion/events-backfill.ts`

#### 3.4 — Funding announcements: Crunchbase RSS + X funding hashtags
- `apps/trendingrepo-worker/src/fetchers/{crunchbase,x-funding}/index.ts`
- Crunchbase: 6h cadence, parse XML, normalize to existing `funding-news` schema
- X via Apify: `$100M`-style search queries, 12h cadence, dedup against existing funding-news, NLP-extract amount/company
- Wire into existing `src/lib/funding/repo-events.ts` aggregator

### Phase D — Deprecate the GH-Actions cron workflows (~2 hours, 1 PR)

After Phase B + C are stable in prod for 24+ hours:

- D1. Move 12 cron workflows to `.github/workflows/_archived/` so they don't run
- D2. Move `scripts/scrape-*.mjs` to `scripts/_archived/`
- D3. Keep `workflow_dispatch` entry points alive for emergency manual triggers
- D4. Update `CLAUDE.md` to reflect the new architecture (worker is the collector home)
- D5. **Hard verification:** 24 hours pass, `/api/health/sources` stays green across every source, no Vercel data-deploys triggered

## Out of scope (defer to other workstreams)

- **Phase 3.2 ClickHouse historical depth** — separate workstream, needs ClickHouse provisioning from operator
- **Phase 4 monetization** (API keys, Stripe, status page) — different session
- **Sentry / structured logging** — needs Sentry account
- **40k-star sparkline cap fix** — license check on `emanuelef/daily-stars-explorer`
- **Re-architecting `src/lib/api/rate-limit-store.ts` to ioredis** — Phase 4 alongside per-API-key rate-limit
- **Touching the data-store contract** — it's the source of truth; the worker conforms TO IT, not vice versa
- **UI changes** — rendering existing data through the new composite score on the homepage is fine; redesigning anything is not

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Railway worker outage = ALL fetching stops (single point of failure vs distributed GH runners today) | Keep GH Actions cron workflows ALIVE during Phase B; only deprecate in Phase D after 24h of green production. Future Phase 5 could add a backup runner (Fly.io machine) |
| Worker memory leak / crash | Railway auto-restarts on crash. Add basic metrics export (`process.memoryUsage()`) in the healthcheck endpoint |
| Cron overlap (job N hasn't finished when N+1 fires) | `croner` has a `protect` option — set on each job. If a job overruns, log + skip the next tick |
| Redis flood under heavy backfill | Phase 1B's data-store pattern is already rate-friendly (1 SET per source per cron tick). Port unchanged. |

## Verification gates (per phase)

**Phase A:**
- `npx tsc --noEmit` clean (root + worker)
- `cd apps/trendingrepo-worker && npm test` passes
- Railway deploy succeeds, healthcheck returns 200
- Manual cron trigger writes a real key to Redis
- Vercel app reads the new key and surfaces it

**Phase B:**
- All 12 sources produce fresh data via the worker
- `/api/health` shows `lastFetchedAt` updates within expected cadence
- Old GH Actions still running (don't break what works)

**Phase C:**
- `/api/scoring/engagement` returns 0-100 scores for top-100 repos
- `/api/health/sources` shows `github-events` as a tracked source
- Funding events from Crunchbase + X show up in the funding feed

**Phase D:**
- 24 hours of green production
- Vercel deploys for the day < 5 (was 30+ pre-Phase-1B)
- No GH-Action cron runs in the last 24h (visible in Actions tab)

## Related docs

- [tasks/data-api.md](data-api.md) — Phase 1B + Railway story
- [tasks/phase-3-source-coverage.md](phase-3-source-coverage.md) — pre-consolidation Phase 3 plan (kept for reference; this doc supersedes it)
- [tasks/phase-4-monetization.md](phase-4-monetization.md) — what comes AFTER P3
- [tasks/workflow-strip-rollout.md](workflow-strip-rollout.md) — Phase 1B activation steps
- [starscreener-inspection/MOAT.md](../starscreener-inspection/MOAT.md) — competitive context
- [starscreener-inspection/SOURCES.md](../starscreener-inspection/SOURCES.md) — full source matrix
