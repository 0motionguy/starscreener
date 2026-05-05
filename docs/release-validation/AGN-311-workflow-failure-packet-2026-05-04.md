# AGN-311 Release SRE workflow failure packet (2026-05-04)

Timestamp (UTC): 2026-05-04T11:12Z
Issue: AGN-311

## Mandatory preflight result
- Command: `npm run freshness:check`
- Host: `http://localhost:3023` reachable (not missing)
- Result: FAIL (stale/degraded)
- Summary: `green=45 yellow=0 red=0 dead=5 blocking_non_green=4 advisory_non_green=1`
- Blocking DEAD keys: `category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`
- Advisory DEAD key: `model-usage`

## Freshness-state evidence (live)
- Endpoint: `GET /api/cron/freshness/state` (authorized)
- CheckedAt: `2026-05-04T11:11:59.655Z`
- Key evidence:
  - `category-metrics`: `lastUpdate=null`, `status=DEAD`, `blocking=true`
  - `mcp-downloads`: `lastUpdate=null`, `status=DEAD`, `blocking=true`
  - `star-snapshots`: `lastUpdate=null`, `status=DEAD`, `blocking=true`
  - `trending-repos`: `lastUpdate=2026-05-04T08:06:14.928Z`, `budget=6h`, `status=DEAD`, `blocking=true`

## Workflow and cron state (live)

### A) Trending pipeline lane (`trending-repos`, `star-snapshots`, `category-metrics`)
- Workflow file: `.github/workflows/scrape-trending.yml`
- Latest runs:
  - Failure: run `25314259155` at `2026-05-04T10:35:41Z`
  - Previous success: run `25309567069` at `2026-05-04T08:43:35Z`
- Failure log evidence (`gh run view 25314259155 --log-failed`):
  - `npm ci` fails before scraper steps
  - lock mismatch: `Invalid: lock file's happy-dom@20.9.0 does not satisfy happy-dom@15.11.7`
- Impact mapping:
  - This workflow runs `snapshot-stars.mjs` and `snapshot-category-metrics.mjs`
  - Install-step failure prevents updates to `star-snapshots` + `category-metrics`

### B) MCP downloads lane (`mcp-downloads`)
- Workflows:
  - `.github/workflows/refresh-npm-downloads.yml`
  - `.github/workflows/refresh-pypi-downloads.yml`
- Latest runs both successful:
  - NPM downloads run `25309562345` success at `2026-05-04T08:43:28Z`
  - PyPI downloads run `25310462473` success at `2026-05-04T09:04:08Z`
- Drift finding:
  - Freshness key still `lastUpdate=null` for `mcp-downloads`
  - Indicates writer/key-path mismatch or publish regression rather than schedule outage

### C) Health gate lane (staleness detector)
- Workflow: `.github/workflows/cron-freshness-check.yml`
- Recent state: mixed success/failure
  - Latest success: run `25313136145` at `2026-05-04T10:07:44Z`
  - Recent failure: run `25307217625` at `2026-05-04T07:45:27Z`
- Failure log evidence (`gh run view 25307217625 --log-failed`):
  - Explicit fail-loud: `health status is 'stale' (expected 'ok')`
- Interpretation:
  - Gate behavior is correct; stale status is being surfaced, not hidden

## Deploy surface checks
- Railway worker status: `railway status` => `Project: starscreener / Environment: production / Service: trendingrepo-worker`
- Railway health: `https://trendingrepo-worker-production.up.railway.app/healthz` => HTTP 200 with `ok:true db:true redis:true lastRunAt:2026-05-04T11:11:23.269Z`
- Vercel CLI deploy-state check blocked:
  - `vercel ls --yes` failed because `VERCEL_PROJECT_ID` is set but `VERCEL_ORG_ID` is missing
  - This prevents live deploy-state verification from this operator session

## Root-cause classification for blocking keys
- `category-metrics`: blocked by `scrape-trending` install failure (`npm ci` lock mismatch)
- `star-snapshots`: blocked by same `scrape-trending` install failure
- `trending-repos`: stale over budget after last write `08:06Z`; same trending lane instability likely contributing
- `mcp-downloads`: workflow success but freshness key null -> data-store publish/path regression (not scheduler failure)

## Rollback readiness
- Current failure mode is scheduler/install and key-publish drift, not a bad deploy artifact proven in this heartbeat.
- Safe rollback path if needed:
  1. Re-run last known good `scrape-trending` workflow at commit from run `25309567069`.
  2. Restore lockfile consistency on `main` so `npm ci` passes in cron runners.
  3. Verify `mcp-downloads` writer publishes aggregate key expected by freshness-state.
  4. Re-run `cron-freshness-check` and confirm `health=ok` before release sign-off.

## Escalations required
- CTO/platform: provide/fix Vercel org/project auth (`VERCEL_ORG_ID` with `VERCEL_PROJECT_ID`) so deploy-state validation can run.
- Platform engineer: repair lockfile drift breaking `npm ci` in `scrape-trending` lane.
- Data/platform engineer: fix `mcp-downloads` publish path so freshness key receives timestamp updates.