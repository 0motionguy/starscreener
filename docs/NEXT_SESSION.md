# Next-session handoff — 2026-04-20

Session-close note after Phase 1 / 2 / 3 + cleanup + P1 docs refresh landed.
Pick up cold from here.

## What shipped

- **Phase 1** — OSS Insight trending → `data/trending.json` scraped hourly by
  `.github/workflows/scrape-trending.yml`; loader in `src/lib/trending.ts`;
  `src/lib/pipeline/ingestion/seed.ts` switched from `SEED_REPOS` to
  `getAllFullNames()`.
- **Phase 2** — hourly GHA workflow gained a `/api/cron/seed` POST to revive the
  snapshot pipeline. Proven architecturally blocked: Vercel Lambda `/tmp` is
  per-invocation, so `/api/cron/seed`'s ingest never reached the same container
  that served `/api/health`. HTTP 200s, zero practical effect.
- **Phase 3** — replaced the snapshot pipeline as delta source with
  `scripts/compute-deltas.mjs`, which walks git history of
  `data/trending.json`, picks the nearest commit per window (1h / 24h / 7d / 30d)
  within a buffer (±30m for 1h/24h, ±6h for 7d/30d), and writes
  `data/deltas.json`. `src/lib/trending.ts::assembleRepoFromTrending` projects
  those deltas onto Repo objects at the boundary; classifier and scoring
  untouched. `/api/health` and `/api/pipeline/status` now ride committed JSON.
- **Cleanup** — 11 files deleted (seed-repos, 3 cron routes, 4 orphan
  ingestion modules, 2 tests, orphan `pipeline.yml` workflow). Dead import
  stripped from `pipeline.ts`; 5 stale comments rewritten semantically (not
  URL-swap). `APP_URL` and `STARSCREENER_URL` repo secrets deleted;
  `CRON_SECRET` retained (still used by `/api/pipeline/*` admin routes via
  `verifyCronAuth`). Tests: **187 / 187 passing** (was 215 — the 28-test drop is
  the two deleted test files).
- **P1 docs refresh** — shipped `7c34a92`. INGESTION.md rewritten for the
  OSS Insight + git-history flow; API.md lost `/api/cron/*` block and gained
  `/api/health`; DEPLOY.md drops the Vercel cron array and seed-on-deploy
  block; ARCHITECTURE.md retired the "Refresh tier system" section.

## Priorities for next session

### P1 — docs refresh  ✅ DONE — `7c34a92`

Living docs refreshed for the Phase 3 architecture. Sealed.

### P2 — UI sweep  ⬅ NEXT UP

These three files read `pipeline.getGlobalStats()` or the pipeline's in-memory
stores, which return zeros on cold Vercel Lambdas. On prod the UI/OG cards
therefore render `0 repos` / `0 stars` / no last-refresh timestamp until the
Lambda warms. Fix: swap them to read from `data/trending.json` +
`data/deltas.json` via `src/lib/trending.ts`, or expose a small `/api/meta`
endpoint that derives the counts from those files.

- [src/components/terminal/StatsBar.tsx](../src/components/terminal/StatsBar.tsx)
- [src/components/terminal/StatsBarClient.tsx](../src/components/terminal/StatsBarClient.tsx)
- [src/app/opengraph-image.tsx](../src/app/opengraph-image.tsx)

### P3 — wait-and-watch (classifier verification)

Do not run before **2026-04-22T02:27Z**. Phase 3 (`17434e5`) landed
2026-04-20T02:27Z; the 48h wait exists so `delta_24h` has real hour-over-hour
data to populate with non-null values before checking `hot` / `breakout`
firing. If the scrape-trending workflow is running green for 24h+ and the
classifier is still silent after that, reopen.

Single-shot check when the window opens:
`GET /api/search?sort=movement` — does at least one repo show
`movementStatus` of `hot` or `breakout`? Pass/fail only; don't diagnose on
fail, flag for the following session.

### P4 — admin API documentation

`/api/pipeline/backfill-history`, `/api/pipeline/cleanup`, and
`/api/pipeline/rebuild` are live but undocumented in `docs/API.md`.
Separate commit, separate review. Requires reading each route for auth
model + behavior before writing prose — do not paraphrase the filename.

## Files explicitly not touched this session (next sessions will)

- `src/components/terminal/StatsBar.tsx`
- `src/components/terminal/StatsBarClient.tsx`
- `src/app/opengraph-image.tsx`

Everything in `docs/review/`, `starscreener-inspection/`, `starscreener-fix/`
was intentionally left alone — those are frozen snapshots.
