# StarScreener Ingestion — Operator Guide

## Ingestion

StarScreener pulls a trending-repo universe from OSS Insight and computes
per-window star deltas from the git history of that universe. Both outputs
are committed JSON files and ship with the build.

## Flow

```
OSS Insight
    │
    ▼
scripts/scrape-trending.mjs  →  data/trending.json  →  git commit
                                       │
                                       ▼
                     scripts/compute-deltas.mjs (walks git log)
                                       │
                                       ▼
                           data/deltas.json  →  git commit
                                       │
                                       ▼
                                Vercel rebuild
                                       │
                                       ▼
                  every Lambda reads the same committed JSON
```

## Why this architecture

Phase 2 tried a conventional cron: `POST /api/cron/seed` on a schedule wrote
ingested metrics into an in-memory snapshot store, and `GET /api/health`
read them back. It returned HTTP 200s and did nothing useful. On Vercel,
each Lambda invocation gets its own `/tmp` and its own process memory —
the writer and reader never shared state, so freshly written snapshots
were invisible to the next request. This is architectural, not a bug.

The fix is to remove shared state from the request path. Scrape and delta
computation run in GitHub Actions, commit both JSON files, and the next
Vercel deploy ships them in the bundle. Every Lambda reads identical bytes
from the build; git history substitutes for a delta database. Serverless
plus cross-invocation state normally needs external infra (KV, Redis,
Postgres); committing JSON gives us the same property for free, with the
deploy pipeline as the only coordination point.

## Scraper (`scripts/scrape-trending.mjs`)

Fetches the cartesian of periods × languages from OSS Insight and writes
`data/trending.json`. No auth required. OSS Insight rate-limits at 600
requests/hour/IP; the script throttles 1.5s between calls (~10 req/min).
Exits 1 on the first failure so the Actions run fails visibly — silent
drift of stale JSON is the exact failure mode this replaces.

## Delta computer (`scripts/compute-deltas.mjs`)

Runs `git log` on `data/trending.json`. For each window in {1h, 24h, 7d,
30d}, picks the commit whose timestamp is nearest to `now − window`, within
a per-window buffer (±30 min for 1h/24h, ±6h for 7d/30d). Loads the
historical snapshot via `git show <sha>:data/trending.json` and joins
against the current snapshot by `repo_id`. Writes `data/deltas.json`.

Cold-start caveat: `delta_30d` only populates fully after 30 days of
continuous hourly operation. Entries emit `basis: "no-history"` when no
commit lands inside the window buffer — expected during ramp, not a bug.

## Cadence (`.github/workflows/scrape-trending.yml`)

Hourly at `:07` UTC. `workflow_dispatch` available for manual triggers.
`fetch-depth: 0` on the checkout step is non-negotiable — `compute-deltas`
needs full history to resolve 30-day-old commits. Observed schedule drift
under GitHub's hourly queue runs ~40 min in the worst case, well within
the delta buffers.

## Storage

Committed JSON under `data/`:

- `data/trending.json` — scraped OSS Insight rows, keyed by period ×
  language; see `TrendingFile` in `src/lib/trending.ts`.
- `data/deltas.json` — per-repo delta entries + per-window pick metadata;
  see `DeltasJson` in `src/lib/trending.ts`.
- `data/producthunt-launches.json` - daily ProductHunt launches from
  `.github/workflows/scrape-producthunt.yml`; requires the repository secret
  `PRODUCTHUNT_TOKEN`.

No database, no pipeline state, no `.data/` directory on prod.

## Operator runbook

- **Force a refresh** — Actions tab → "Scrape OSS Insight trending" → Run
  workflow. Commits land on `main` and trigger a Vercel rebuild.

- **Read `/api/health`** — returns `status`, `lastFetchedAt` (scraper),
  `computedAt` (deltas), `ageSeconds.{scraper,deltas}`, `thresholdSeconds`,
  `stale.{scraper,deltas}`, `coveragePct`. 503 when either signal is stale
  (>2h old). A `warning` field appears when `coveragePct < 50` — expected
  during the first 30 days, not a failure.

- **Read `/api/pipeline/status`** — same freshness gates as `/api/health`
  plus volume counts (`repoCount`, `snapshotCount`, `hotCount`,
  `breakoutCount`).

- **Deploy-lag vs. scraper-failure diagnosis** — if `/api/health` reports
  `lastFetchedAt > 2h` old on prod, check (a) the latest `data/trending.json`
  commit timestamp — if recent, this is Vercel deploy lag, not a scraper
  failure; (b) the Actions tab for the last `scrape-trending` run. Delta
  staleness almost always traces to either the scrape workflow failing or
  a Vercel build not triggering, never to a server-side cron.

## Local dev

```bash
node scripts/scrape-trending.mjs
node scripts/compute-deltas.mjs
PRODUCTHUNT_TOKEN=... node scripts/scrape-producthunt.mjs
```

Idempotent and safe to run anytime. `GITHUB_TOKEN` only matters for the
ad-hoc `POST /api/pipeline/ingest` path; it is not used by either script.

## Relevant source files

- `scripts/scrape-trending.mjs` — OSS Insight scraper.
- `scripts/compute-deltas.mjs` — git-history delta computer.
- `src/lib/trending.ts` — loader + shape definitions.
- `.github/workflows/scrape-trending.yml` — hourly workflow.
- `src/app/api/health/route.ts` — freshness gate.
- `src/app/api/pipeline/status/route.ts` — telemetry + freshness gate.
