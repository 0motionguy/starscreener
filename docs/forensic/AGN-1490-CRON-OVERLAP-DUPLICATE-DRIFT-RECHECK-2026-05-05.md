# AGN-1490 [Sprint 1 audit] Release/SRE cron overlap and duplicate trigger drift recheck (2026-05-05)

## Mandatory opening + freshness preflight (this heartbeat)
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` at `2026-05-05T01:16:02.119Z`:
  - localhost target `http://localhost:3023` is reachable (not missing).
  - status is stale/degraded (`health=stale`, `sourceStatus=degraded`).
  - summary: `green=37`, `yellow=11`, `red=2`, `dead=0`, `blocking_non_green=11`, `advisory_non_green=2`.
  - blocking RED sources: `producthunt`, `trending-repos`.

## Live workflow-state verification status
- `gh workflow list --limit 200` failed with `HTTP 401: Bad credentials`.
- Consequence: this heartbeat can verify schedule overlap from repo workflow YAML, but cannot verify live Actions run health/state until auth is restored.

## Cron overlap recheck (schedule definitions on current branch)
Source: `rg -n "^\s*schedule:|^\s*- cron:" .github/workflows`

Key collision windows still present:
1. `:00` burst remains the highest contention window (includes 3h/6h/daily jobs and hourly fan-out starts).
2. `:17` burst still stacks multiple jobs (`scrape-bluesky`, `refresh-collection-rankings`, `refresh-star-activity`, `refresh-reddit-baselines`, `sre-route-cost-attribution-verify`).
3. `03:xx` daily cluster remains dense (`refresh-skill-*`, `refresh-mcp-*`, `refresh-hotness-snapshot`, `refresh-star-activity`).
4. Shared `*/15` cadence remains duplicated (`cron-freshness-check`, `sre-actions-visibility`).
5. Shared `*/30` cadence remains duplicated (`health-watch`, `sources-auto-recover`).

Interpretation: schedule-level overlap risk remains active in the repo state; no evidence in this heartbeat of a full overlap elimination.

## Duplicate-trigger / duplicate-writer drift recheck
Verified shared-key dual-writer paths remain present:
1. `collection-rankings`
   - GHA: `refresh-collection-rankings.yml` -> `scripts/scrape-trending.mjs --only-collection-rankings`
   - Worker: `apps/trendingrepo-worker/src/fetchers/collection-rankings/index.ts`
2. `trending`, `trending-lite`
   - GHA: `scrape-trending.yml` -> `scripts/scrape-trending.mjs`
   - Worker: `apps/trendingrepo-worker/src/fetchers/oss-trending/index.ts`
3. `deltas`
   - GHA: `scrape-trending.yml` -> `scripts/compute-deltas.mjs`
   - Worker: `apps/trendingrepo-worker/src/fetchers/deltas/index.ts`
4. `devto-mentions`, `devto-trending`
   - GHA: `scrape-devto.yml` -> `scripts/scrape-devto.mjs`
   - Worker: `apps/trendingrepo-worker/src/fetchers/devto/index.ts`
5. `reddit-mentions`, `reddit-all-posts`
   - GHA lane includes `scripts/scrape-reddit.mjs`
   - Worker: `apps/trendingrepo-worker/src/fetchers/reddit/index.ts`
6. `producthunt-launches`
   - GHA: `scrape-producthunt.yml` -> `scripts/scrape-producthunt.mjs`
   - Worker: `apps/trendingrepo-worker/src/fetchers/producthunt/index.ts`
7. `trustmrr-startups`, `revenue-overlays`
   - GHA: `sync-trustmrr.yml` -> `scripts/sync-trustmrr.mjs`
   - Worker: `apps/trendingrepo-worker/src/fetchers/trustmrr/index.ts`

Interpretation: duplicate-writer drift risk remains unresolved for key freshness-critical surfaces.

## Release/SRE blocker classification (this heartbeat)
1. GitHub Actions live-state inspection blocked by auth (`gh` 401 bad credentials).
2. Freshness gate is executable but non-green (`blocking_non_green=11`), indicating stale deploy/schedule/data-path risk remains.

## Rollback readiness
- No deploy-impact code/workflow edits were made in this heartbeat.
- Rollback path for future single-writer changes remains:
  1. restore prior schedule lines in `.github/workflows/*`,
  2. trigger `workflow_dispatch` for impacted workflows,
  3. verify freshness budget recovery via `npm run freshness:check`.

## Required external unblock
- Owner: CTO/platform.
- Needs:
  1. restore GitHub auth for workspace (`gh auth login` or valid token) so live workflow state can be inspected;
  2. approve single-writer authority per shared key family before any overlap/duplicate trigger cutover.
