# AGN-1276 Redis key provenance for mcp/trending surfaces (2026-05-05)

## Mandatory opening + freshness gate

- Re-read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Freshness gate (`npm run freshness:check`): localhost `3023` reachable (not missing), but stale/degraded: `GET /api/health?soft=1 -> HTTP 500`.

## Scope

Requested surface: Redis key provenance for `mcp` + `trending` paths.

## Evidence commands

```powershell
npm run freshness:check
```

```powershell
rg -n "writeDataStore\(|trending-mcp|mcp-dependents|mcp-smithery-rank|mcp-downloads|trending|collection-rankings" scripts/scrape-trending.mjs apps/trendingrepo-worker/src
```

```powershell
$env:ISSUE_ID='AGN-1276'; node scripts/audit-redis-file-drift.mjs
Get-Content .data/redis-file-drift-matrix.jsonl -Tail 1
```

## Provenance map (writer path)

### Trending surface

- `trending`: 
  - Writer paths: 
    - GHA script path via `scripts/scrape-trending.mjs` (`writeDataStore("trending", ...)`).
    - Worker path via `apps/trendingrepo-worker/src/fetchers/oss-trending/index.ts` (`writeDataStore('trending', ...)`).
  - Workflow lane: `.github/workflows/scrape-trending.yml` (`node scripts/scrape-trending.mjs`).

- `collection-rankings`:
  - Writer paths:
    - GHA script path `scripts/scrape-trending.mjs` (`writeDataStore("collection-rankings", ...)`).
    - Worker path `apps/trendingrepo-worker/src/fetchers/collection-rankings/index.ts`.
  - Workflow lanes: `.github/workflows/refresh-collection-rankings.yml` and worker fetcher run.

### MCP surface

- `trending-mcp`:
  - Writer path: worker publish layer `apps/trendingrepo-worker/src/lib/publish.ts` writes `writeDataStore(`trending-${type}`)`; MCP type resolves to `trending-mcp`.
  - Source fetcher chain: MCP source fetchers (`pulsemcp`, `smithery`, `glama`, `mcp-registry-official`) feed publish pipeline.

- `mcp-downloads`:
  - Writer path: `apps/trendingrepo-worker/src/fetchers/npm-downloads/index.ts` (`writeDataStore('mcp-downloads', ...)`) and per-package `mcp-downloads:<pkg>`.

- `mcp-dependents`:
  - Writer path: `apps/trendingrepo-worker/src/fetchers/npm-dependents/index.ts` (`writeDataStore('mcp-dependents', ...)`) and per-package `mcp-dependents:<pkg>`.

- `mcp-smithery-rank`:
  - Writer path: `apps/trendingrepo-worker/src/fetchers/mcp-smithery-rank/index.ts` (`writeDataStore('mcp-smithery-rank', ...)`).

## Writer attribution mechanism verification

- Collector lane provenance fields set in `scripts/_data-store-write.mjs` (`writer`, `runId`, `commit`; serialized into `ss:meta:v1:<key>`).
- Worker lane provenance fields set in `apps/trendingrepo-worker/src/lib/redis.ts`; fetcher identity injected by `apps/trendingrepo-worker/src/run.ts` (`setCurrentFetcherName`) and written as `worker:<fetcher>`.
- App-side parser accepts provenance JSON or legacy ISO in `src/lib/data-store.ts` (`parseWrittenAt`).

## Current observed writers (live evidence sample)

From latest `.data/redis-file-drift-matrix.jsonl` row:

- `trending` -> `redisWriter: worker:oss-trending`
- `deltas` -> `redisWriter: worker:deltas`
- `mcp-downloads` -> `redisWriter: worker:npm-downloads`
- `mcp-dependents` -> `redisWriter: worker:npm-dependents`
- `mcp-smithery-rank` -> `redisWriter: worker:mcp-smithery-rank`
- `collection-rankings` -> `redisWriter: github-actions:Refresh collection rankings`

## Acceptance check for AGN-1276

- Freshness status measured: yes (stale/degraded; localhost not missing).
- Redis writer provenance for `mcp` + `trending` keys verified through code and live matrix evidence: yes.
- Dual-writer behavior identified and attributed per key: yes.
- Append-only logs untouched: yes (read-only evidence generation).
