# AGN-360 Cron overlap + duplicate effort verification (2026-05-04)

## Mandatory opening + freshness evidence

- Mandatory opening files were read in this heartbeat:
  - `CLAUDE.md`
  - `docs/ENGINE.md`
  - `docs/SITE-WIREMAP.md`
  - `docs/AUDIT-2026-05-04.md`
  - `docs/forensic/00-INDEX.md`
  - `tasks/CURRENT-SPRINT.md`
  - `tasks/BACKLOG.md`
- `npm run freshness:check` at `2026-05-04T12:07:23.564Z`:
  - `localhost:3023` is reachable (`health=ok`) and not missing.
  - Product is stale/degraded: `blocking_non_green=5`, `dead=5`, `advisory_non_green=1`.
  - Blocking dead rows include `trending-repos`, `star-snapshots`, `category-metrics`, `mcp-downloads`.

## Live cron/workflow verification

Commands used:

- `gh workflow list --limit 200`
- `gh run list --limit 80 --json workflowName,status,conclusion,createdAt,event`
- `rg -n "^on:|cron:" .github/workflows -g "*.yml"`
- `rg -n "scrape-trending\\.mjs|check-freshness\\.mts|/api/cron/freshness" .github/workflows -g "*.yml"`

Observed from live run stream:

- `2026-05-04T12:04:16Z` `Cron - freshness check` completed `success`.
- `2026-05-04T11:46:15Z` `Audit - source freshness` completed `failure`.
- `2026-05-04T10:35:41Z` `Refresh fast discovery` completed `failure`.
- `2026-05-04T10:29:16Z` `Source health watch` completed `failure`.
- `2026-05-04T10:28:01Z` `Sync TrustMRR revenue overlays` completed `failure`.
- `2026-05-04T10:27:01Z` `Uptime monitor` completed `success`.
- `2026-05-04T10:26:10Z` `Refresh Bluesky signals` completed `failure`.

## Verified overlap / duplicate-effort facts

1. Freshness duplicated check path:
   - `.github/workflows/cron-freshness-check.yml` runs every 15 minutes.
   - `.github/workflows/audit-freshness.yml` runs hourly.
   - Both monitor freshness state, creating duplicate failure noise when shared blocking rows are dead.

2. Same collector split into two workflows:
   - `.github/workflows/scrape-trending.yml` runs `node scripts/scrape-trending.mjs --skip-collection-rankings`.
   - `.github/workflows/refresh-collection-rankings.yml` runs `node scripts/scrape-trending.mjs --only-collection-rankings`.
   - This is deliberate fan-out but duplicates checkout/install/runtime overhead and increases divergence risk.

3. Minute-window overlap still present:
   - `scrape-trending` at minute `:27` can overlap operational jobs around the same window (`sync-trustmrr`, uptime/health jobs), increasing contention during degraded periods.

## Release SRE interpretation

- Current failures are operational freshness failures, not a localhost process absence.
- Distinguish stale deploy/data-plane failure from code-not-running:
  - `localhost:3023` reachable + `health=ok` confirms runtime is up.
  - `dead` freshness rows + failing freshness/watch workflows indicate stale/degraded data-plane.

## Rollback readiness

- Fast rollback for cron-impact edits: revert schedule/script changes under `.github/workflows/**` and trigger targeted `workflow_dispatch` smoke runs.
- No cadence merge should ship until one full UTC day passes with `freshness:check` showing `blocking_non_green=0`.
