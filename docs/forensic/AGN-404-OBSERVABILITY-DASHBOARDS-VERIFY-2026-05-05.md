---
status: snapshot
audit-date: 2026-05-05
reason: ticket-bound observability dashboards verification for AGN-404
verified-by: claude
---

# AGN-404 Observability Dashboards Verification (2026-05-05)

Issue: AGN-404
Owner lane: Release SRE

## Fresh verification results

### 1) Freshness gate (stale vs code-failure discriminator)
- Command: `npm run freshness:check`
- Result: FAIL (policy), but service reachable
- Evidence:
  - `health=ok`, `sourceStatus=degraded`
  - `localhost:3023` reachable (not missing)
  - `blocking_non_green=18`, `red=4`, `yellow=15`
  - Red sources include: `lobsters`, `producthunt`, `trending-repos`, `twitter`
- Classification: this is **data freshness degradation**, not a localhost process failure.

### 2) GitHub Actions cron/workflow state (live)
- Auth fix applied in-session: `GITHUB_TOKEN` env override cleared for `gh` calls.
- Commands and outcomes:
  - `gh run list --workflow "Uptime monitor (every 5 minutes)" --limit 5`: recent runs all `success`
  - `gh run list --workflow "Cron - freshness check" --limit 5`: mixed `success`/`failure`
  - `gh run list --workflow "Source health watch" --limit 5`: all recent runs `failure`
  - `gh run list --workflow "scrape-trending.yml" --limit 5`: all recent runs `failure`
- Release signal: cron surfaces are observable; major ingestion pathways are currently failing and explain freshness RED/YELLOW state.

### 3) Vercel deploy state (live)
- Context fix applied in-session: loaded `.vercel/project.json` and set both `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID`.
- Command: `vercel ls`
- Result: successful listing of preview + production deployments.
- Evidence: multiple recent production deploys in `Ready` state, plus frequent preview `Error` states.

### 4) Railway/Redis operational health (live)
- Command: `railway status` and worker `/healthz`
- Result: PASS
- Evidence payload:
  - `ok=true`
  - `db=true`
  - `redis=true`
  - `lastRunAt=2026-05-05T06:15:01.993Z`

## Rollback readiness
If production regression occurs:
1. Use `vercel ls` to identify last known-good **Production / Ready** deployment.
2. Promote/rollback to that deployment in Vercel.
3. Re-run `npm run freshness:check` and confirm `health=ok` plus reduced blocking_non_green.
4. Confirm Railway worker remains healthy (`/healthz` reports `ok/db/redis=true`).

## Outcome for AGN-404 scope
- Shared observability evidence now includes:
  - freshness policy state (with stale-vs-code-failure distinction)
  - live workflow state sampling for uptime/freshness/source-health/trending
  - Vercel deployment state visibility
  - Railway/Redis health checks
- Remaining failures are runtime/source freshness incidents, not a missing observability path.
