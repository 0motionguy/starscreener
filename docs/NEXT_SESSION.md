# Next-session handoff — 2026-04-20

Session-close note after Phase 1 / 2 / 3 + cleanup + P1 docs refresh +
OSS Insight AI collections import landed. Pick up cold from here.

## What shipped

### Session: P2 stats sweep + P4 admin API docs (2026-04-20 afternoon)

- `fix(ui)` stats surfaces read from committed JSON, not pipeline state
  → `5ea4156`. `/api/pipeline/status` now derives `stats.totalRepos`
  (681) and `stats.totalStars` (469k) from `getTrackedRepoCount()` /
  `getTotalStars()` against trending+deltas JSON. `hotCount` /
  `breakoutCount` return null until P3 verifies the classifier
  end-to-end — UI renders em-dash via `?? "—"` guards.
  `/opengraph-image` swapped to JSON helpers; now prerenders static.
  `StatsBar.tsx` (server-component variant) deleted — was zero
  importers. New helpers: `getTrackedRepoCount`, `getTotalStars`,
  `getTopMoversByDelta24h(limit)` in `src/lib/trending.ts`. Tests:
  **187 / 187 still passing**.
- `docs` admin API reference for
  `/api/pipeline/{backfill-history,cleanup,rebuild}` → `5e522b0`.
  P4 surfaced one auth-helper drift (backfill-history uses inline
  `verifyAuth()` not the shared `verifyCronAuth`) — documented in a
  structured "Known auth divergence" callout, migration tracked as
  P10 below.
- P3 deferred (current 2026-04-20T05:23Z, earliest 2026-04-22T02:27Z).
- P5 deferred (earliest 2026-04-27T02:27Z).

### Session: OSS Insight AI collections imported (2026-04-20)

- `fix(deltas)` cold-start fallback → `741139a`
- `feat(collections)` 28 Apache-2.0 YAMLs → `5f3e31a`
- `feat(collections)` `/collections` + `/collections/[slug]` routes → `54cf020`
- `/api/health` now reports `coverageQuality: "partial"` (expected during
  cold-start window).
- Next milestone: real `delta_24h` coverage lands **2026-04-22T02:27Z**
  (48h post `17434e5`).

### Earlier this working day

- **Phase 1** — OSS Insight trending → `data/trending.json` scraped hourly by
  `.github/workflows/scrape-trending.yml`; loader in `src/lib/trending.ts`;
  `src/lib/pipeline/ingestion/seed.ts` switched from `SEED_REPOS` to
  `getAllFullNames()`.
- **Phase 2** — hourly GHA workflow gained a `/api/cron/seed` POST to revive
  the snapshot pipeline. Proven architecturally blocked: Vercel Lambda `/tmp`
  is per-invocation, so `/api/cron/seed`'s ingest never reached the same
  container that served `/api/health`. HTTP 200s, zero practical effect.
- **Phase 3** — replaced the snapshot pipeline as delta source with
  `scripts/compute-deltas.mjs`, which walks git history of
  `data/trending.json`, picks the nearest commit per window (1h / 24h / 7d /
  30d) within a buffer (±30m for 1h/24h, ±6h for 7d/30d), and writes
  `data/deltas.json`. `src/lib/trending.ts::assembleRepoFromTrending`
  projects those deltas onto Repo objects at the boundary; classifier and
  scoring untouched. `/api/health` and `/api/pipeline/status` now ride
  committed JSON.
- **Cleanup** — 11 files deleted (seed-repos, 3 cron routes, 4 orphan
  ingestion modules, 2 tests, orphan `pipeline.yml` workflow). Dead import
  stripped from `pipeline.ts`; 5 stale comments rewritten semantically (not
  URL-swap). `APP_URL` and `STARSCREENER_URL` repo secrets deleted;
  `CRON_SECRET` retained (still used by `/api/pipeline/*` admin routes via
  `verifyCronAuth`). Tests: **187 / 187 passing**.
- **P1 docs refresh** — shipped `7c34a92`. INGESTION.md rewritten for the
  OSS Insight + git-history flow; API.md lost `/api/cron/*` block and gained
  `/api/health`; DEPLOY.md drops the Vercel cron array and seed-on-deploy
  block; ARCHITECTURE.md retired the "Refresh tier system" section.

## Priorities for next session

### P1 — docs refresh  ✅ DONE — `7c34a92`

Living docs refreshed for the Phase 3 architecture. Sealed.

### P2 — UI sweep  ✅ DONE — `5ea4156`

`/api/pipeline/status.stats` now reads from committed JSON;
`/opengraph-image` likewise. Dead `StatsBar.tsx` deleted. UI renders
em-dash for null hot/breakout counts until P3 verifies classifier.
Sealed.

### P3 — classifier verification (wait-and-watch)  ⬅ NEXT UP

Do not run before **2026-04-22T02:27Z**. Phase 3 (`17434e5`) landed
2026-04-20T02:27Z; the 48h wait exists so `delta_24h` has real
hour-over-hour data to populate with non-null values before checking
`hot` / `breakout` firing.

Single-shot check when the window opens — pass/fail only, don't diagnose
on fail:

```bash
curl -s "https://starscreener.vercel.app/api/search?sort=momentum" \
  | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); \
    console.log((d.repos||[]).some(r => r.movementStatus==='hot' \
    || r.movementStatus==='breakout') ? 'PASS' : 'FAIL')"
```

Note: this curl currently returns `{"results":[]}` because the in-memory
pipeline that backs `/api/search` is empty on cold Lambdas (P9). The
classifier signal won't be observable here until P9 reroutes the search
endpoint through committed JSON. Until then, an alternative classifier
verification path is to extend `/api/pipeline/status.stats` to populate
`hotCount` / `breakoutCount` from inline classification on assembled
JSON Repos and check against em-dash → number.

If FAIL and the scrape-trending workflow has been green for 24h+, reopen
as a real investigation in the following session.

### P4 — admin API documentation  ✅ DONE — `5e522b0`

API.md now covers `/api/pipeline/{backfill-history,cleanup,rebuild}`
including auth model, body shape, response shape, side effects, and
rate-limit behavior. Sealed.

### P5 — collection page sparklines + delta history charts

Do not start before **2026-04-27T02:27Z** — requires >7d of continuous
hourly snapshots so 7d-of-bars has something real to render. Scope: add
per-row inline SVG sparklines to `/collections/[slug]` showing last 7d of
star-delta bars or similar. Reuse the existing repo-detail sparkline
component if it exists; otherwise the simplest possible 7-bar inline
SVG, no chart library.

Out of scope for P5: per-collection aggregate charts (collection-level
momentum over time), delta-history cross-filtering, custom date ranges.

### P6 — intra-collection filtering

Only if user feedback requests it. Do not pre-build. Curation IS a
filter; let it breathe before adding language / min-stars / etc. filters
on top. If built, reuse existing FilterBar variants rather than inventing
a collection-specific one.

### P7 — extra AI collections beyond the 28

Manual curation as upstream adds new AI categories. Periodic resync
procedure documented in `data/collections/NOTICE.md`. No automation —
this is a quarterly manual pass:

1. Clone pingcap/ossinsight.
2. Diff its `configs/collections/` against our `data/collections/`.
3. Copy any new AI-relevant YAMLs, strip numeric prefix, update
   NOTICE.md sync date + commit SHA.

### P8 — compare OG card + other pipeline-backed OG/social cards

Same cold-Lambda root cause that P2 fixed for the homepage OG and
StatsBar. Surfaces still bound to in-memory pipeline state:

- `src/app/compare/opengraph-image.tsx` — calls
  `pipeline.getRepoSummary(id)` and `pipeline.getTopMovers("today", 2)`.
  On cold Lambda both return null/empty so the fallback "Compare Repos"
  static card always wins, never the rich N-card layout.
- `src/app/categories/[slug]/twitter-image.tsx` — verify whether it
  reaches into pipeline state; if so, same fix.

Fix pattern: read from committed JSON via the helpers landed in P2
(`getTopMoversByDelta24h`, `getTrackedRepoCount`, etc.). For
`getRepoSummary` equivalents, may need a new helper that returns a
JSON-derived single-repo bundle keyed by fullName.

Commit: `fix(og): compare + category social cards read from committed JSON`

### P9 — `/api/search` and homepage repo cards return empty on cold Lambda

`/api/search?sort=momentum` returns `{"results":[]}` on prod (verified
during P2 recon). Same root: `pipeline.getTopMovers()` reads from the
empty in-memory `repoStore`. The homepage repo cards via
`src/app/page.tsx::pipeline.getTopMovers("today", 80)` likely render
empty for the same reason — visual confirmation needed.

Fix pattern: route the `/api/search` and `/api/repos` handlers through
a JSON-derived path that assembles `Repo[]` from
`getAllFullNames()` + `assembleRepoFromTrending()` instead of
`repoStore.getActive()`. Note that `assembleRepoFromTrending` requires
a base `Repo` object — likely need a small adapter that builds the
base from a `TrendingRow` rather than from a stored `Repo`.

This is the bigger one of the two — it touches the homepage and the
search experience. Worth its own design pass before implementing.

Commit: `fix(search): repo discovery reads from committed JSON, not pipeline state`

### P10 — migrate backfill-history to verifyCronAuth

Source: docs/API.md "Known auth divergence" callout surfaced this during P4.

Scope: `src/app/api/pipeline/backfill-history/route.ts:43-54` replaces inline
`verifyAuth()` with `verifyCronAuth` from `src/lib/api/auth.ts`. Update
`docs/API.md` to remove the divergence callout.

Pre-work: `git blame src/app/api/pipeline/backfill-history/route.ts:43-54`
and confirm the inline check wasn't intentional (e.g., author comment
explaining why dev-fallback was rejected). If intentional, escalate — do
not silently migrate.

Risk: none beyond the intended behavior change (adds dev-mode permissiveness
+ timing-safe comparison). No callers depend on the 401-only behavior;
production has CRON_SECRET set.

Commit: `fix(api): backfill-history uses shared verifyCronAuth`

## Files explicitly not touched this session (P8 / P9 will)

- `src/app/compare/opengraph-image.tsx` — P8
- `src/app/categories/[slug]/twitter-image.tsx` — P8 (audit first)
- `src/app/api/search/route.ts` — P9
- `src/app/api/repos/route.ts` — P9
- `src/app/page.tsx` — P9 (homepage repo cards via `pipeline.getTopMovers`)

Everything in `docs/review/`, `starscreener-inspection/`,
`starscreener-fix/` was intentionally left alone — those are frozen
snapshots.
