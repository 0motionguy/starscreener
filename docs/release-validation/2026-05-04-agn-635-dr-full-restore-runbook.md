# AGN-635 Disaster Recovery Runbook Verification - Full Restore from Backup (2026-05-04)

Timestamp (Asia/Makassar): 2026-05-04T23:05:38+08:00
Issue: AGN-635
Owner lane: Release SRE

## Mandatory opening verification
Completed in this heartbeat:
- Read `CLAUDE.md`
- Read `docs/ENGINE.md`
- Read `docs/SITE-WIREMAP.md`
- Read `docs/AUDIT-2026-05-04.md`
- Read `docs/forensic/00-INDEX.md`
- Read `tasks/CURRENT-SPRINT.md`
- Read `tasks/BACKLOG.md`
- Ran `npm run freshness:check`

Freshness result:
- `localhost:3023` is reachable (not missing)
- Check failed with `GET /api/cron/freshness/state -> HTTP 500 Internal Server Error`
- Classification: stale/degraded product state, not local host absence

## Live operational evidence captured

### Railway worker and Redis health
Command evidence:
- `railway status` -> `Project: starscreener`, `Environment: production`, `Service: trendingrepo-worker`
- `railway domain` -> `https://trendingrepo-worker-production.up.railway.app`
- `curl.exe -sS https://trendingrepo-worker-production.up.railway.app/healthz`
- `curl.exe -sS https://trendingrepo-worker-production.up.railway.app/health`

Observed payload:
```json
{"ok":true,"db":true,"redis":true,"lastCheckAt":"2026-05-04T15:05:40.198Z","lastRunAt":"2026-05-04T15:00:03.547Z"}
```

Interpretation:
- Worker runtime is alive.
- DB connectivity is healthy.
- Redis connectivity is healthy.
- Background run cadence is active.

### GitHub Actions live inspection
Command evidence:
- `gh workflow list --limit 200`

Observed failure:
- `HTTP 401: Bad credentials`

Interpretation:
- Current shell cannot verify live workflow state.
- This blocks release-SRE acceptance criteria requiring live cron/workflow inspection.

### Vercel deploy-state inspection
Command evidence:
- `vercel ls --yes`

Observed failure:
- `You specified VERCEL_PROJECT_ID but you forgot to specify VERCEL_ORG_ID`

Interpretation:
- Current shell cannot verify production deployment lineage or execute rollback from CLI.
- This blocks deploy-state verification and restore rehearsal closure.

## Full restore-from-backup runbook (operator sequence)

This is the minimal DR sequence to restore customer-facing service while separating deploy failure vs data freshness failure.

1. Confirm blast scope first.
- Hit `https://trendingrepo.com/api/health?soft=1` and `https://trendingrepo.com/api/cron/freshness/state`.
- If health endpoint fails but worker `/healthz` is green, suspect web deploy/runtime path.
- If health is up but freshness keys are stale/non-green, suspect collectors/workflows/data path.

2. Restore web runtime to last known good deployment.
- In Vercel dashboard, identify the last successful production deployment before incident time.
- Rollback/promote that deployment.
- Re-check:
  - `https://trendingrepo.com/api/health?soft=1`
  - `https://trendingrepo.com/api/cron/freshness/state`

3. Validate data plane continuity after web rollback.
- Confirm Railway worker health remains green (`/healthz` -> `ok/db/redis: true`).
- Confirm freshness rows improve on next collector windows.
- If freshness remains degraded after web rollback, classify as data/cron failure (not web deploy failure).

4. Restore data snapshots only if Redis/source-of-truth is corrupted.
- Use latest known-good bundled data fallback already in deploy artifact (tiered reader path).
- Re-run target collectors via workflow dispatch once auth is available.
- Verify timestamps per key return inside budget windows.

5. Declare incident class for accurate ownership.
- Deploy regression: rollback fixed health and user paths.
- Data pipeline regression: rollback did not fix freshness; handoff to workflow/collector owners.

## Rollback readiness status for AGN-635
- Railway/Redis runtime health: VERIFIED GREEN.
- GitHub Actions cron/workflow live state: BLOCKED (missing `gh` auth).
- Vercel deploy lineage/rollback CLI verification: BLOCKED (missing `VERCEL_ORG_ID`).
- End-to-end restore rehearsal: BLOCKED pending both auth gaps.

## CTO escalation required
Blocked on:
1. GitHub auth for this shell (`gh auth login` or valid token) to inspect live workflow state.
2. Vercel org context (`VERCEL_ORG_ID` paired with `VERCEL_PROJECT_ID`) to inspect/rollback deploys.

Needs:
- CTO/platform to provide the credentials/context above.
- After credentials are available, rerun AGN-635 drill and attach proof of:
  - last known good deploy identifier,
  - rollback execution record,
  - post-rollback health/freshness verification.
