# Cron Overlap and Duplicate Effort Map (2026-05-04)

Issue: AGN-252  
Owner lane: Release SRE (workflows/deploy safety scope)

## Live evidence used

- Mandatory preflight freshness:
  - `npm run freshness:check` at `2026-05-04T10:27:03.404Z`
  - localhost `http://localhost:3023` reachable (`health=ok`) but product stale/degraded:
    - `blocking_non_green=5`
    - `DEAD`: `category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`
    - `YELLOW`: `reddit`
- Workflow cron inventory:
  - `rg -n "^on:|cron:|schedule:" .github/workflows -g "*.yml"`
- Live workflow execution stream:
  - `gh run list --limit 200 --json workflowName,conclusion,status,createdAt,updatedAt,event,displayTitle,number`

## Overlap map (same minute / adjacent minute contention)

1. `:00` minute burst (highest overlap window, pre-stagger)
- `audit-freshness.yml` (`0 * * * *`)
- `cron-aiso-drain.yml` (`0,30 * * * *`)
- `cron-pipeline-cleanup.yml` (`0 4 * * *`)
- `scrape-devto.yml` (`0 */6 * * *`)
- `scrape-producthunt.yml` (`0 11,15,19,23 * * *`)
- `sweep-staleness.yml` (`0 2 * * *`)
- Results: these schedules stacked on `:00`, creating avoidable queue pressure in GitHub Actions.

2. `:17` minute burst
- `scrape-bluesky.yml` (`17 * * * *`)
- `refresh-collection-rankings.yml` (`17 */6 * * *`)
- `refresh-star-activity.yml` (`17 3 * * *`)
- `refresh-reddit-baselines.yml` (`17 3 * * 1`)

3. `03:xx` daily burst (dense fan-out)
- `refresh-skill-*` jobs at `03:00`, `03:05`, `03:12`, `03:13`
- `refresh-mcp-smithery-rank.yml` at `03:11`
- `refresh-hotness-snapshot.yml` at `03:25`
- `refresh-mcp-usage-snapshot.yml` + `refresh-skill-smithery.yml` both at `03:30`
- `refresh-skill-lobehub.yml`/`refresh-skill-derivatives.yml` nearby windows

## Duplicate effort map (same script/data domain, separate workflows)

1. `scripts/scrape-trending.mjs` split across two workflows
- `scrape-trending.yml`: `node scripts/scrape-trending.mjs --skip-collection-rankings`
- `refresh-collection-rankings.yml`: `node scripts/scrape-trending.mjs --only-collection-rankings`
- Duplicate install/checkout/runtime overhead on separate schedules.

2. Freshness checks in two independent jobs
- `cron-freshness-check.yml` every 15 minutes
- `audit-freshness.yml` hourly
- Both evaluate freshness and can produce overlapping failure noise when a shared source is stale.

3. MCP daily/6h mixed refresh surface
- `ping-mcp-liveness.yml` (6h), `refresh-mcp-smithery-rank.yml` (daily), `refresh-mcp-usage-snapshot.yml` (daily), `refresh-mcp-dependents.yml` (daily)
- Same product surface (`/mcp`) fed by disjoint cron windows; stale-key risk if one leg fails.

## Live failure evidence tied to overlap windows

- `Refresh Bluesky signals` failed at `2026-05-04T10:26:10Z`.
- `Cron - pipeline ingest` in progress at `2026-05-04T10:23:58Z`.
- `Uptime monitor` in progress at `2026-05-04T10:27:01Z`.
- `Cron - freshness check` succeeded at `2026-05-04T10:07:44Z`, but local freshness still reported 5 blocking non-green sources.

Interpretation: workflow health can look green while product freshness remains degraded if side-effect steps are partial (`continue-on-error` paths and domain splits).

## Rollback readiness and operational recommendation

1. Rollback path (workflow-level)
- Cron rollback can be done by reverting schedule lines in `.github/workflows/*.yml` and dispatching targeted workflows (`workflow_dispatch`) for smoke confirmation.

2. AGN-448 stagger applied (2026-05-04)
- `audit-freshness.yml`: `0 * * * *` -> `8 * * * *`
- `cron-aiso-drain.yml`: `0,30 * * * *` -> `3,33 * * * *`
- `cron-pipeline-cleanup.yml`: `0 4 * * *` -> `12 4 * * *`
- `scrape-devto.yml`: `0 */6 * * *` -> `18 */6 * * *`
- `scrape-producthunt.yml`: `0 11,15,19,23 * * *` -> `22 11,15,19,23 * * *`
- `sweep-staleness.yml`: `0 2 * * *` -> `32 2 * * *`
- Rollback: revert the six cron lines above and run each workflow via `workflow_dispatch` once to validate.

3. Lowest-risk consolidation candidate
- Consolidate collection-ranking refresh into `scrape-trending.yml` cadence and retire standalone `refresh-collection-rankings.yml` only after two consecutive green runs with fresh `collection-rankings`.

4. Safety gate before cadence edits
- Require one full UTC day where `freshness:check` has `blocking_non_green=0` before reducing or merging jobs.

## Scope boundary

This note maps overlap/duplication and release risk only. It does not redesign product scoring logic or add new data sources.
