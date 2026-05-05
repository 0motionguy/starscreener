# AGN-1121 Trending-repos freshness failure trace (collector -> store -> UI) - 2026-05-05

## Scope
Trace why `trending-repos` appears non-green in freshness checks, using current local evidence only.

## Mandatory opening + freshness gate
- Mandatory files read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Freshness run (`npm run freshness:check`) result:
  - localhost:3023 reachable (not missing)
  - status stale/degraded
  - `trending-repos` reported `DEAD`
  - summary `green=18 yellow=10 red=4 dead=18 blocking_non_green=27`

## Collector layer (workflow + script)
- Workflow: `.github/workflows/scrape-trending.yml`
  - cron: `7,27,47 * * * *`
  - runs `node scripts/scrape-trending.mjs --skip-collection-rankings`
  - commits `data/trending.json`, `data/trending-lite.json`, `data/_meta/trending.json`, and trace log.
- Script: `scripts/scrape-trending.mjs`
  - writes keys `trending`, `trending-lite`, `hot-collections` through `writeDataStore(...)`
  - writes local files only when Redis write is not `redis`
  - appends `.data/trending-dual-write-trace.jsonl`

## Store layer evidence
- Local files present:
  - `data/trending.json` exists, mtime `2026-05-04T06:41:59Z`
  - `data/trending-lite.json` is missing locally
  - `data/_meta/trending.json` exists with `reason=ok`, `ts=2026-05-04T08:06:14.928Z`
- Dual-write trace tail includes only collection-rankings event in sampled line:
  - `fetchTrendBuckets=false`, `fetchCollectionRankings=true`, no trending/trending-lite write in that event.

## Freshness API layer (source classification)
- Route: `src/app/api/cron/freshness/state/route.ts`
- `trending-repos` source spec:
  - `metaSource: "trending"`
  - `redisSlugs: ["trending", "trending-lite"]`
  - budget `6h`
- Inspect logic:
  - source status is `maxStatus(classify(age), ...probeStatuses)`
  - probe status `DEAD` for any required slug escalates source to `DEAD`
  - default mode is effectively `all` (no `redisGroupMode: "any"` for `trending-repos`)

## UI read path
- Home page reads through `refreshTrendingFromStore()` in `src/lib/trending.ts`.
- `refreshTrendingFromStore()` reads only `trending` and `deltas` keys (not `trending-lite`).

## Current root-cause conclusion
`trending-repos` freshness is being marked `DEAD` by freshness-state aggregation because one required sibling key (`trending-lite`) resolves `DEAD`/missing in the freshness probe path, even while `trending.json` + `meta/trending` exist. This is a collector/store-to-freshness classification mismatch, not a direct UI read-path break.

## Minimal remediation options (for follow-up issue)
1. In freshness route, set `trending-repos` to `redisGroupMode: "any"` for `trending`/`trending-lite`.
2. Or enforce `trending-lite` presence in every trending collector execution path and ensure fallback file mirror includes it.
3. Keep provenance fields (`lastWriter`, `runId`, `commit`) populated for these keys to improve drift diagnosis.
