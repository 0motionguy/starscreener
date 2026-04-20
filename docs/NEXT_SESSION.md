# Next-session handoff — 2026-04-20

Session-close note after Phase 1 / 2 / 3 + cleanup landed. Pick up cold from here.

## What shipped this session

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

## Priorities for next session

### P1 — docs refresh

Living docs still describe the deleted cron routes as authoritative. Four files
to update:

- [docs/INGESTION.md](INGESTION.md) — biggest rewrite. Old narrative is
  cron-tier-driven ingestion as the primary path. New narrative: hourly GHA
  workflow scrapes OSS Insight → computes deltas from git history → commits
  both JSON files → Vercel rebuilds → every Lambda reads the same committed
  JSON. Delete the old cron tiers section and rewrite from scratch rather
  than diff-patching.
- [docs/API.md](API.md) — delete the three sections documenting
  `/api/cron/seed`, `/api/cron/ingest`, `/api/cron/backfill-top`. Do not
  strikethrough; delete.
- [docs/DEPLOY.md](DEPLOY.md) — replace the Vercel cron config example with
  one line pointing at `.github/workflows/scrape-trending.yml` as the
  ingestion schedule.
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — one-line mention of
  `/api/cron/ingest` at line 132; trivial fix.

**Include this operator note somewhere prominent in the refreshed docs
(either INGESTION.md's ops section or DEPLOY.md's troubleshooting block):**

> If `/api/health` reports `lastFetchedAt` > 2h old on prod, check
> (a) the latest `data/trending.json` commit timestamp — if recent, this is
> Vercel deploy lag, not a scraper failure; (b) the Actions tab for the last
> `scrape-trending` run. Delta staleness almost always traces to either the
> scrape workflow failing or a Vercel build not triggering, never to a
> server-side cron.

**Do NOT touch** these — they're historical audit snapshots, not living docs:

- `docs/review/**`
- `starscreener-inspection/**`
- `starscreener-fix/**`

### P2 — UI sweep (committed-JSON-backed source for cold Lambdas)

These three files read `pipeline.getGlobalStats()` or the pipeline's in-memory
stores, which return zeros on cold Vercel Lambdas. On prod the UI/OG cards
therefore render `0 repos` / `0 stars` / no last-refresh timestamp until the
Lambda warms. Fix: swap them to read from `data/trending.json` +
`data/deltas.json` via `src/lib/trending.ts`, or expose a small `/api/meta`
endpoint that derives the counts from those files.

- [src/components/terminal/StatsBar.tsx](../src/components/terminal/StatsBar.tsx)
- [src/components/terminal/StatsBarClient.tsx](../src/components/terminal/StatsBarClient.tsx)
- [src/app/opengraph-image.tsx](../src/app/opengraph-image.tsx)

### P3 — wait-and-watch

Do not diagnose classifier behavior for 48 hours. `delta_24h` needs real
hour-over-hour data to populate with non-null values; `hot` / `breakout` can't
fire until that coverage is meaningful. If the scrape-trending workflow is
running green for 24h+ and classifier still silent after that, reopen.

## Files explicitly not touched this session (next sessions will)

- `docs/INGESTION.md`
- `docs/API.md`
- `docs/DEPLOY.md`
- `docs/ARCHITECTURE.md`
- `src/components/terminal/StatsBar.tsx`
- `src/components/terminal/StatsBarClient.tsx`
- `src/app/opengraph-image.tsx`

Everything in `docs/review/`, `starscreener-inspection/`, `starscreener-fix/`
was intentionally left alone — those are frozen snapshots.
