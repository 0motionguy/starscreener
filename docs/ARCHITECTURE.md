# TrendingRepo — Architecture

High-level walkthrough of how data flows from GitHub into the terminal UI.

## Overview

```
  ┌────────────────┐      ┌────────────────┐      ┌────────────────┐
  │  GitHub API    │──────▶  github-adapter │──────▶   normalizer   │
  │  (+ HN/Reddit) │      │  (fetch + rl)  │      │ raw -> Repo    │
  └────────────────┘      └────────────────┘      └────────┬───────┘
                                                            │
                                                            ▼
  ┌────────────────┐      ┌────────────────┐      ┌────────────────┐
  │    repoStore   │◀─────│    ingest()    │◀─────│  snapshotStore │
  │  (+ singleton) │      │  (+ mentions)  │      │  (timeseries)  │
  └───────┬────────┘      └────────────────┘      └────────────────┘
          │
          ▼
  ┌────────────────┐      ┌────────────────┐      ┌────────────────┐
  │   recompute()  │─────▶│  scoring/ eng. │─────▶│   scoreStore   │
  │                │─────▶│ classification │─────▶│  categoryStore │
  │                │─────▶│    reasons/    │─────▶│   reasonStore  │
  │                │─────▶│   alerts/ eng. │─────▶│ alertEventStore│
  └───────┬────────┘      └────────────────┘      └────────────────┘
          │
          ▼
  ┌────────────────┐      ┌────────────────┐      ┌────────────────┐
  │ queries/service│─────▶│  pipeline.ts   │─────▶│   /api routes  │───▶ UI
  │                │      │   (facade)     │      │                │
  └────────────────┘      └────────────────┘      └────────────────┘
```

## Data flow

1. **Ingest** (`src/lib/pipeline/ingestion/ingest.ts`) — pulls from GitHub (or mock), normalizes to the `Repo` shape, records a snapshot, pulls social mentions (HN + Reddit + GitHub issues).
2. **Snapshot** (`src/lib/pipeline/ingestion/snapshotter.ts`) — persists point-in-time counts so the delta engine can compute 24h / 7d / 30d change.
3. **Recompute** (`src/lib/pipeline/pipeline.ts::recomputeAll`) — runs every derived engine in one consistent pass:
   - delta computation
   - scoring (composite 0-100)
   - classification (rule-based categories)
   - reasons (human-readable "why it's moving")
   - rank assignment (global + per-category)
   - alert evaluation (against the previous tick's context)
4. **Query** (`src/lib/pipeline/queries/*`) — read-only functions that return view-model shapes for the UI (featured cards, meta counts, top movers, compare, category stats, etc.).
5. **API routes** (`src/app/api/**`) — thin wrappers over the facade.

## Facade pattern

Every consumer (UI, API, tests, future MCP server) reaches into the pipeline through the single `pipeline` object in `src/lib/pipeline/pipeline.ts`. Stores and engines are never imported directly from the app layer. This keeps the surface small and lets internals (storage, scoring) evolve without breaking callers.

## Scoring

Source: `src/lib/pipeline/scoring/`.

The composite momentum score blends 10 components, each scaled to 0-100:

| Component | Default weight | What it measures |
|-----------|---------------|------------------|
| starVelocity24h | 0.20 | Daily star gain |
| starVelocity7d | 0.15 | Weekly star gain |
| forkVelocity7d | 0.08 | Weekly fork gain |
| contributorGrowth30d | 0.10 | Unique-contributor delta |
| commitFreshness | 0.12 | Hours since last commit |
| releaseFreshness | 0.08 | Days since last tagged release |
| socialBuzz | 0.12 | HN+Reddit+issue mentions (decayed) |
| issueActivity | 0.05 | Open issue churn |
| communityHealth | 0.05 | Maintainer responsiveness |
| categoryMomentum | 0.05 | How the whole category is performing |

Weights are category-overrideable (`src/lib/pipeline/scoring/weights.ts`) — AI repos lean harder on socialBuzz, devtools lean harder on commitFreshness, security on releaseFreshness. After merging, weights are re-normalized to sum to 1.0.

Modifiers (`src/lib/pipeline/scoring/modifiers.ts`):
- Anti-spam dampening for viral-then-flat patterns.
- Breakout flag: component z-scores cross a threshold.
- Quiet killer flag: sustained mid-tier growth without social noise.

## Storage

Source: `src/lib/pipeline/storage/`.

All stores implement a common `*Store` interface (in-memory today, Postgres-ready tomorrow). Singletons are created once at boot (`storage/singleton.ts`) and shared across API routes.

Stores:

- `repoStore` — canonical `Repo` records.
- `scoreStore` — latest `RepoScore` per repo.
- `categoryStore` — latest classification.
- `reasonStore` — latest `RepoReason`.
- `snapshotStore` — timeseries for delta computation.
- `mentionStore` — social mentions (per-repo aggregate).
- `alertRuleStore` / `alertEventStore` — rule CRUD + fired events.

**Persistence**: JSONL files in `.data/` (or `STARSCREENER_DATA_DIR`). Every store serializes through `file-persistence.ts::persistAll` and rehydrates on boot via `hydrateAll`. Persistence is best-effort — failures are logged but never block reads/writes.

## Social aggregator

Source: `src/lib/pipeline/adapters/social-aggregator.ts`.

Pulls mentions from three sources and computes a decayed buzz score per repo:

1. **Hacker News** via the Algolia search API (`hn.algolia.com`).
2. **Reddit** via the public JSON endpoints (no auth required).
3. **GitHub issues** via the search API (`search/issues?q=...`).

Rate-limited, errors swallowed. All three adapters implement `SocialAdapter`.

## Alert engine

Source: `src/lib/pipeline/alerts/`.

Rules are persisted via `alertRuleStore`. On every `recomputeAll()`, the engine builds a `TriggerContext` per repo using **both** the fresh state AND the previous tick's snapshot so rank-jump, momentum-threshold crossings, new-release detection, and breakout transitions work correctly. Fired events land in `alertEventStore` and can be fetched via `/api/pipeline/alerts?userId=...`.

Supported triggers:
- `momentum_threshold` (crossing up/down)
- `rank_jump` (delta in rank position)
- `new_release` (release since previous tick)
- `breakout` (breakout flag flipped on)

## Refresh via Redis-backed data-store (with committed-JSON fallback)

Source: `scripts/scrape-trending.mjs`, `scripts/compute-deltas.mjs`, `.github/workflows/scrape-trending.yml`, `src/lib/trending.ts`, `src/lib/data-store.ts`.

Ingestion does not run in the request path. A GitHub Actions workflow scrapes OSS Insight hourly, runs the delta computer against the git history of `data/trending.json`, and commits both `data/trending.json` and `data/deltas.json`. Collectors **dual-write** the same payload to Redis via [scripts/_data-store-write.mjs](../scripts/_data-store-write.mjs).

The runtime read path is three-tier: Redis first, bundled JSON next, in-memory last-known-good last. This makes Redis the source of truth while preserving uptime if Redis is unreachable. Per-source `refreshXxxFromStore()` hooks rate-limit Redis pings to ≤1 / 30s with in-flight dedupe so calling them on every render is cheap. Phase-3's earlier "committed-JSON only, every Lambda reads identical bytes" design is the **fallback layer** — Redis is the primary truth as of 2026-Q2 (Phase 4). See [CLAUDE.md](../CLAUDE.md) "Critical Conventions" and [tasks/data-api.md](../tasks/data-api.md) for the migration plan.

`src/lib/trending.ts::assembleRepoFromTrending` projects per-window delta values onto `Repo` objects at the query boundary; scoring and classification below are untouched. Freshness is enforced by `/api/health`, `/api/pipeline/status`, and `/api/cron/freshness/state` against the data-store's per-source `_meta` timestamps. See [INGESTION.md](./INGESTION.md) for the full flow and operator runbook.

## Seeing changes

After ingestion, the UI doesn't hot-reload automatically — call `/api/pipeline/recompute` so derived stores are fresh. In production the committed JSON is refreshed hourly by the scrape workflow and a Vercel rebuild picks it up; no recompute call is needed on the request path.

## trendingrepo-worker overlap

A sister Railway service (`apps/trendingrepo-worker/`, branched in worktrees not yet merged to `main`) hosts ~37 fetchers — MCP registries, funding sources, agent-commerce discovery, the consensus K2.6 analyst, scoring shadow runs, and several signal sources that overlap the main repo's collectors. The two systems share the same Redis data-store but ownership splits as follows:

**Main-repo wins (5 sources)** — when a signal exists in both, the main payload is the source of truth and worker payloads are namespaced (`worker:<source>:*`) cross-checks:

- **arxiv** — `scripts/scrape-arxiv*` (main) is canonical; worker's arxiv fetcher is a backup / cross-check
- **bluesky** — `scripts/scrape-bluesky*` (main) owns the mention pipeline; worker only enriches profile metadata
- **devto** — `scripts/scrape-devto*` (main) owns the article corpus
- **hackernews** — `scripts/scrape-hn*` (main) owns story + count rollups
- **funding** — `scripts/collect-funding*` (main) owns the FundingEvent ETL; worker pulls a parallel feed for cross-validation only

**Worker wins (1 source)**:

- **twitter** — `/twitter` reads `twitter-repo-signals` populated by the worker's Apify (`apidojo~tweet-scraper`) fetcher. The CI-side `scripts/_apify-twitter-provider.ts` writes append-only `.data/twitter-*.jsonl` for forensic audit, but the live Redis key surfacing on `/twitter` is worker-fetched. See [SITE-WIREMAP.md §3b](./SITE-WIREMAP.md).

Audit cross-reference: `docs/ultra-audit-2026-05-01.md` A6, `.audit/2026-05-04-swarm/phase-logs/A3-architecture-themes.md` C6.

## Related docs

- [INGESTION.md](./INGESTION.md) — operator guide to GitHub ingestion
- [DEPLOY.md](./DEPLOY.md) — Vercel deployment
- [DATABASE.md](./DATABASE.md) — Postgres migration plan
- [API.md](./API.md) — per-endpoint reference
