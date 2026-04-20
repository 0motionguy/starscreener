# Next-session handoff — 2026-04-20

Session-close note after P9 + P8 + P10 + P3 shipped on top of
Phase 1/2/3 + P1 docs + P2 stats + P4 admin API docs +
OSS Insight AI collections. Pick up cold from here.

## What shipped

### Session: P9 + P8 + P10 + P3 shipped (2026-04-20)

- **P9** → `8201db2`. `src/lib/derived-repos.ts` assembles a fully-
  scored, classified, ranked `Repo[]` from `data/trending.json` +
  `data/deltas.json` at module load. Source priority for deltas:
  OSS Insight period aggregates (primary) → `data/deltas.json`
  (non-cold-start fallback) → 0. `/api/search`, `/api/repos`, and
  the homepage server component (`src/app/page.tsx`) now read from
  this derived set instead of the empty-on-cold-Lambda
  `repoStore`. `src/lib/trending.ts::getTopMoversByDelta24h`
  realigned to the same OSS Insight `past_24_hours` bucket so the
  homepage OG card and the main terminal agree on movers.
- **P8** → `9aba172`. `src/app/compare/opengraph-image.tsx` and
  `src/app/categories/[slug]/opengraph-image.tsx` resolve repos
  through the new `derived-repos` helpers. The compare card no
  longer falls back to the static "Compare Repos" placeholder on
  cold Lambdas; the category card no longer shows "No repos yet".
  `twitter-image.tsx` delegates to the OG renderer, so it inherits
  the fix automatically.
- **P10** → `d2b160e`. `/api/pipeline/backfill-history` replaced
  its inline 11-line CRON_SECRET check with a call through
  `verifyCronAuth` from `src/lib/api/auth.ts`. Auth surface now
  matches `cleanup`, `rebuild`, `ingest`, and `persist`: dev-mode
  permissiveness + timing-safe bearer comparison + 401/503 parity.
  Callout removed from `docs/API.md`.
- **P3** → (bundled in `8201db2`). Classifier produces real signal
  via the OSS Insight period-delta fallback. Pre-session every
  repo was `declining` because all 4 delta windows in
  `data/deltas.json` were `cold-start`; the derived-repos source
  priority means `past_24_hours` / `past_week` / `past_month` star
  counts reach the scorer directly. `/api/search?sort=momentum` on
  prod reports **26 breakouts / 40 rising** (see Session-close
  verification below).
- `src/lib/pipeline/__tests__/derived-repos.test.ts` +
  `derived-repos-smoke.test.ts` added. Test count: **190 / 190
  passing**.

### Earlier this working day

#### Session: P2 stats sweep + P4 admin API docs (2026-04-20 afternoon)

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
  **187 / 187 still passing** (at the time).
- `docs` admin API reference for
  `/api/pipeline/{backfill-history,cleanup,rebuild}` → `5e522b0`.

#### Session: OSS Insight AI collections imported (2026-04-20)

- `fix(deltas)` cold-start fallback → `741139a`
- `feat(collections)` 28 Apache-2.0 YAMLs → `5f3e31a`
- `feat(collections)` `/collections` + `/collections/[slug]` routes → `54cf020`
- `/api/health` now reports `coverageQuality: "partial"` (expected during
  cold-start window).
- Next milestone: real `delta_24h` coverage lands **2026-04-22T02:27Z**
  (48h post `17434e5`).

#### Phase 1 / 2 / 3 / Cleanup / P1 docs refresh

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
  scoring untouched. `/api/health` and `/api/pipeline/status` ride
  committed JSON.
- **Cleanup** — 11 files deleted (seed-repos, 3 cron routes, 4 orphan
  ingestion modules, 2 tests, orphan `pipeline.yml` workflow). Dead import
  stripped from `pipeline.ts`; stale comments rewritten.
  `APP_URL` / `STARSCREENER_URL` repo secrets deleted; `CRON_SECRET`
  retained (still used by `/api/pipeline/*` admin routes).
- **P1 docs refresh** — shipped `7c34a92`.

## Session-close verification (2026-04-20, post-push)

- `/api/search?sort=momentum` — real `results[]` with live classifications
  (26 breakout / 40 rising visible).
- `/api/health` — `status: "ok"`, `coverageQuality: "partial"` (expected
  during the 48h warm-up window; flips to `full` after 2026-04-22T02:27Z
  if real `delta_24h` / `delta_7d` land as planned).
- `/collections/mcp-servers` — HTTP 200.
- `/compare/opengraph-image` — HTTP 200 (P8 confirmation — no longer
  falls back to the static "Compare Repos" placeholder).

See the curl output captured at session close for exact numbers.

## Active backlog

### P5 — collection page sparklines + delta history charts

Earliest start: **2026-04-27T02:27Z** (~7d out). Requires >7d of
continuous hourly trending snapshots so 7d-of-bars has something real to
render. Scope: add per-row inline SVG sparklines to `/collections/[slug]`
showing last 7d of star-delta bars or similar. Reuse the existing
repo-detail sparkline component if it exists; otherwise the simplest
possible 7-bar inline SVG, no chart library.

Out of scope for P5: per-collection aggregate charts (collection-level
momentum over time), delta-history cross-filtering, custom date ranges.

### P6 — intra-collection filtering

**On demand only.** Do not pre-build. Curation IS a filter; let it
breathe before adding language / min-stars / etc. filters on top. If
built, reuse existing FilterBar variants rather than inventing a
collection-specific one.

### P7 — extra AI collections beyond the 28

**On demand only.** Manual curation as upstream adds new AI categories.
Quarterly resync procedure documented in `data/collections/NOTICE.md`.

## Follow-ups from this session

No new drift surfaced; backlog is P5 + P6 + P7.

Everything in `docs/review/`, `starscreener-inspection/`,
`starscreener-fix/` remains frozen snapshots — do not touch.
