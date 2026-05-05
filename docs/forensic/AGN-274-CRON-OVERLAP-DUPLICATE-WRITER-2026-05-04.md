# AGN-274 Cron overlap + duplicate writer risk check (2026-05-04)

Issue: AGN-274  
Owner lane: [OPS] Release SRE  
Scope: workflow/cron overlap, duplicate writer risk, single-writer recommendation

## Live verification context

- Mandatory opening bundle re-read this heartbeat (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- `npm run freshness:check` outcome in this heartbeat:
  - localhost `http://localhost:3023` reachable (not missing),
  - but `/api/cron/freshness/state` returned `HTTP 500` (degraded/stale gate).
- GitHub Actions live API degraded during this heartbeat:
  - `gh run list --limit 60` returned `HTTP 401 Bad credentials`.
  - Schedule and writer evidence below is therefore grounded in repo workflow + worker source files.

## Schedule overlap evidence (file-level)

- `.github/workflows/scrape-trending.yml` -> `cron: "7,27,47 * * * *"`
- `.github/workflows/sync-trustmrr.yml` -> `cron: "27 ... * * *"` (hourly at `:27`, plus a dedicated `02:27`)
- `.github/workflows/scrape-bluesky.yml` -> `cron: "17 * * * *"`
- `.github/workflows/refresh-collection-rankings.yml` -> `cron: "17 */6 * * *"`
- `.github/workflows/refresh-star-activity.yml` -> `cron: "17 3 * * *"`
- `.github/workflows/refresh-reddit-baselines.yml` -> `cron: "17 3 * * 1"`
- dense 03:xx daily fan-out:
  - `refresh-skill-install-snapshot.yml` (`03:00`)
  - `refresh-skill-skillsmp.yml` (`03:05`)
  - `refresh-mcp-smithery-rank.yml` (`03:11`)
  - `refresh-skill-claude.yml` (`03:12`)
  - `refresh-skill-forks-snapshot.yml` (`03:13`)
  - `refresh-hotness-snapshot.yml` (`03:25`)
  - `refresh-mcp-usage-snapshot.yml` + `refresh-skill-smithery.yml` (`03:30`)

## Duplicate writer map (key-level)

1) `collection-rankings`  
- Writer A (GHA): `.github/workflows/refresh-collection-rankings.yml` runs `node scripts/scrape-trending.mjs --only-collection-rankings`  
- Writer B (worker): `apps/trendingrepo-worker/src/fetchers/collection-rankings/index.ts` writes `writeDataStore('collection-rankings', ...)`, scheduled `17 */6 * * *`  
- Classification: drift risk (same key, two independent schedulers, same minute cadence)  
- Recommended single writer: **worker** (`collection-rankings` fetcher), keep GHA path only as manual backfill/fallback.

2) `trending` + `hot-collections`  
- Writer A (GHA): `.github/workflows/scrape-trending.yml` runs `node scripts/scrape-trending.mjs --skip-collection-rankings`  
- Writer B (worker): `apps/trendingrepo-worker/src/fetchers/oss-trending/index.ts` writes `writeDataStore('trending', ...)` and `writeDataStore('hot-collections', ...)`  
- Classification: drift risk (same keys, different cadences/content assembly paths)  
- Recommended single writer: **worker** for Redis truth; keep file commit lineage via one designated snapshot workflow only if required for deploy seeding.

3) `devto-trending` + `devto-mentions`  
- Writer A (GHA): `scripts/scrape-devto.mjs` writes `writeDataStore('devto-trending', ...)` / `writeDataStore('devto-mentions', ...)` via `.github/workflows/scrape-devto.yml`  
- Writer B (worker): `apps/trendingrepo-worker/src/fetchers/devto/index.ts` writes both keys  
- Classification: drift risk (dual writers; prior audit already flagged ambiguity)  
- Recommended single writer: **worker**; retain GHA scrape only as break-glass.

4) `reddit-mentions` + `reddit-all-posts`  
- Writer A (GHA): `scripts/scrape-reddit.mjs` writes both keys via `scrape-trending.yml` loop  
- Writer B (worker): `apps/trendingrepo-worker/src/fetchers/reddit/index.ts` writes both keys (`schedule: '30 * * * *'`)  
- Classification: drift risk (two ingestion lanes with separate runtime/env behavior)  
- Recommended single writer: **worker** primary; if GHA remains, move to explicit fallback mode and mark as non-primary.

5) `producthunt-launches`  
- Writer A (GHA): `scripts/scrape-producthunt.mjs` via `.github/workflows/scrape-producthunt.yml`  
- Writer B (worker): `apps/trendingrepo-worker/src/fetchers/producthunt/index.ts` writes same key, schedule `0 11,15,19,23 * * *`  
- Classification: drift risk (identical cadence windows across lanes)  
- Recommended single writer: **worker** primary.

6) `revenue-overlays` + `trustmrr-startups`  
- Writer A (GHA): `.github/workflows/sync-trustmrr.yml` runs `node scripts/sync-trustmrr.mjs` hourly (`:27`) + daily mode.  
- Writer B (worker): `apps/trendingrepo-worker/src/fetchers/trustmrr/index.ts` writes same keys on `27 * * * *`.  
- Classification: high drift/overlap risk (same minute, same key family, both hourly)  
- Recommended single writer: **worker** primary, GHA limited to manual recovery.

## Intentional redundancy (lower risk if declared)

- `mcp-smithery-rank`, `mcp-usage-snapshot`, `skill-install-snapshot` cadence crowding at 03:xx is not automatically duplicate-writing by itself when each key has only one writer.  
- Risk here is operational contention (runner/queue pressure), not data ownership ambiguity.

## Rollback/readiness recommendation

1. For each risky dual-writer key above, declare one primary writer in `docs/ENGINE.md`.  
2. Move the non-primary lane to `workflow_dispatch` only (break-glass) or add explicit guard to skip writes unless override flag is set.  
3. After each ownership cutover, require two consecutive freshness-green windows before removing fallback.

## Acceptance criteria outcome for AGN-274

- Identify keys with multiple active writers + cadence overlap: **done** (see duplicate writer map).  
- Classify overlap as intentional redundancy vs drift risk: **done**.  
- Provide recommended single-writer owner per risky key: **done** (worker primary for risky dual-writer keys).  
- Attach schedule/file evidence: **done** (workflow and worker file references above).
