# AGN-1351 [Sprint 1 audit] Cron overlap and duplicate-writer risk refresh (2026-05-05)

## Mandatory opening + freshness preflight (this heartbeat)
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` result:
  - Failure: `'tsx' is not recognized as an internal or external command`
  - Interpretation: scripted freshness gate could not execute in this runtime.
- Direct localhost probes at `2026-05-05T06:20:20.3214256+08:00`:
  - `GET http://localhost:3023/api/health?soft=1` -> `Unable to connect to the remote server`
  - `GET http://localhost:3023/api/cron/freshness/state` -> `Unable to connect to the remote server`
  - Classification: localhost `3023` is **missing** in this heartbeat (not stale/degraded).

## Live cron/workflow inspection status
- `gh workflow list --limit 200` -> `HTTP 401: Bad credentials`
- `gh run list --limit 30 --json workflowName,status,conclusion,createdAt,updatedAt,headSha` -> `HTTP 401: Bad credentials`
- Consequence: live Actions run-state verification is blocked this heartbeat.

## Current overlap evidence (repo workflow schedule map)
Verified from `.github/workflows/*.yml` cron entries:
- `scrape-trending.yml` -> `7,27,47 * * * *`
- `sync-trustmrr.yml` -> `27 2 * * *` and `27 0,1,3,...,23 * * *`
- `cron-freshness-check.yml` and `sre-actions-visibility.yml` both -> `*/15 * * * *`
- `collect-twitter.yml` and several heavy sources align at `0 */3 * * *` or `*/6` windows
- Daily 03:xx concentration remains (`refresh-skill-*`, `refresh-mcp-*`, `refresh-hotness-snapshot`, `refresh-star-activity`)

Interpretation: minute-window overlap risk remains structurally present in schedule definitions.

## Verified duplicate-writer key collisions (code-path evidence)
Still dual-writer between GHA collector lane and Railway worker lane for shared keys:
1. `collection-rankings`
   - GHA path: `.github/workflows/refresh-collection-rankings.yml` -> `scripts/scrape-trending.mjs --only-collection-rankings`
   - Worker path: `apps/trendingrepo-worker/src/fetchers/collection-rankings/index.ts`
2. `trending` / `trending-lite`
   - GHA path: `.github/workflows/scrape-trending.yml` -> `scripts/scrape-trending.mjs`
   - Worker path: `apps/trendingrepo-worker/src/fetchers/oss-trending/index.ts`
3. `devto-mentions` / `devto-trending`
   - GHA path: `scripts/scrape-devto.mjs`
   - Worker path: `apps/trendingrepo-worker/src/fetchers/devto/index.ts`
4. `reddit-mentions` / `reddit-all-posts`
   - GHA path: `scripts/scrape-reddit.mjs` (inside `scrape-trending` lane)
   - Worker path: `apps/trendingrepo-worker/src/fetchers/reddit/index.ts`
5. `producthunt-launches`
   - GHA path: `scripts/scrape-producthunt.mjs`
   - Worker path: `apps/trendingrepo-worker/src/fetchers/producthunt/index.ts`
6. `trustmrr-startups` / `revenue-overlays`
   - GHA path: `scripts/sync-trustmrr.mjs`
   - Worker path: `apps/trendingrepo-worker/src/fetchers/trustmrr/index.ts`
7. `deltas`
   - GHA path: `scripts/compute-deltas.mjs` from `scrape-trending.yml`
   - Worker path: `apps/trendingrepo-worker/src/fetchers/deltas/index.ts`

Interpretation: duplicate-writer risk remains active; no single-writer cutover evidence in this heartbeat.

## Blockers / unblock owner
1. Live workflow/cron state verification blocked by GitHub auth failure (`gh` 401).
2. Local freshness gate execution blocked by missing `tsx` runtime command.
3. Local product endpoint validation blocked by localhost service down (`3023` unreachable).

Unblock owner: CTO/platform.
Needs:
- Restore GitHub auth for this workspace (`gh auth login` or valid token).
- Restore local runtime dependencies so `npm run freshness:check` can execute (`tsx` available).
- Restore local app service on `localhost:3023` for endpoint-level freshness classification.

## Rollback readiness note
- No deploy-impact edits were performed in this heartbeat; rollback is N/A for code changes.
- For operational rollback after single-writer cutover (future step): restore previous non-primary writer path and run one manual refresh per affected key family to reseed canonical timestamps.
