# AGN-847 Release SRE heartbeat - Error budget and SLO definitions

Date: 2026-05-05
Issue: AGN-847
Owner: [OPS] Release SRE

## Mandatory opener evidence

- Read completed: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` executed at `2026-05-05T00:16:35.1485606+08:00`.
- Local target state: `localhost:3023` unreachable.
- Result: `freshness-check: request timed out while contacting http://localhost:3023`.
- Interpretation: localhost is missing/unreachable for this heartbeat, so local freshness classification cannot be completed.

## Live ops evidence (current heartbeat)

### Production health and freshness

- `GET https://trendingrepo.com/api/health?soft=1` returned:
  - `status=stale`
  - `sourceStatus=ok`
  - `lastFetchedAt=2026-05-04T04:13:49.436Z`
  - `warning=refresh degraded: 6/6 dependency refreshes failed; serving cached health snapshot`
- `GET https://trendingrepo.com/api/cron/freshness/state` returned:
  - `{"ok":false,"reason":"unauthorized"}`

### Railway worker and Redis connectivity

- `railway status`:
  - Project: `starscreener`
  - Environment: `production`
  - Service: `trendingrepo-worker`
- `railway domain`:
  - `https://trendingrepo-worker-production.up.railway.app`
- `GET https://trendingrepo-worker-production.up.railway.app/healthz` returned:
  - `{"ok":true,"db":true,"redis":true,"lastCheckAt":"2026-05-04T16:16:21.462Z","lastRunAt":"2026-05-04T16:15:01.400Z"}`

### GitHub Actions and Vercel visibility blockers

- `gh auth status`:
  - `Failed to log in to github.com using token (GITHUB_TOKEN)`
  - `The token in GITHUB_TOKEN is invalid`
- `gh run list` and `gh workflow list`:
  - `HTTP 401: Bad credentials`
- `vercel ls`:
  - `You specified VERCEL_PROJECT_ID but you forgot to specify VERCEL_ORG_ID`

Interpretation: live cron and deploy-state verification from this shell are currently blocked by auth/context configuration, not by confirmed service-runtime crash.

## SLO definitions (OBS-2 baseline)

All SLO windows use rolling 28-day measurement unless stated otherwise.

| SLI | SLO target | Error budget (28d) | Breach severity | Owner |
|---|---|---|---|---|
| Production health endpoint availability (`/api/health?soft=1`) | >= 99.9% successful checks | <= 40m 19s unavailable | P1 if projected burn > 2x in 24h | Release SRE |
| Freshness-state endpoint operability (`/api/cron/freshness/state`) | >= 99.5% successful authenticated checks | <= 3h 21m 36s unavailable | P1 if no authenticated visibility for >4h | Release SRE |
| Cron execution success ratio (scheduled workflows in `.github/workflows/**`) | >= 99.0% successful runs | <= 6h 43m equivalent failed-run budget | P1 if any P0 workflow fails 3 consecutive schedules | Release SRE + workflow owner |
| Worker runtime health (`/healthz`: ok+db+redis true) | >= 99.9% healthy checks | <= 40m 19s unhealthy | P1 if unhealthy >15m continuously | Release SRE |
| Staleness guard (`status` not `stale` for homepage critical data) | >= 99.0% non-stale windows | <= 6h 43m stale windows | P1 if stale >2h continuously | Release SRE + data pipeline |

## Error budget policy

- Burn-rate thresholds:
  - Fast burn: >10% of monthly budget consumed in 1 hour -> immediate incident channel.
  - Medium burn: >25% of monthly budget consumed in 24 hours -> same-day remediation plan.
  - Slow burn: >50% of monthly budget consumed in 7 days -> freeze non-critical deploy-impact changes.
- Deployment gate policy:
  - If any P1 SLO is in fast-burn state, block non-rollback deploys.
  - If two or more SLOs are in medium-burn state, require CTO approval for deploy-impact merges.

## Release verification and rollback readiness

### Release verification checklist (must pass before marking release healthy)

1. Deployment visibility confirmed (Vercel production deployment ID + commit SHA).
2. Workflow health confirmed (`gh run list` for critical workflows, latest schedule outcomes green).
3. Worker health confirmed (`/healthz` -> ok/db/redis true).
4. Production app health confirmed (`/api/health?soft=1` not stale).
5. Freshness auth-path confirmed (`/api/cron/freshness/state` authenticated 200).

### Rollback path

1. Identify previous known-good production deployment SHA.
2. Roll back/promote previous Vercel deployment.
3. Re-run steps 2-5 from release verification checklist.
4. If app health recovers but stale persists, classify as data/cron freshness failure (not code regression) and hand off to data pipeline/workflow owners.

## Current status vs SLOs

- Cannot complete cron success SLI verification: blocked by invalid `GITHUB_TOKEN` in shell (`gh` 401).
- Cannot complete deploy-state SLI verification: blocked by missing `VERCEL_ORG_ID`.
- Freshness-state operability currently failing from this shell (`unauthorized`).
- Worker health SLI currently green from live `/healthz`.
- Production app health currently serving but stale.

Decision: AGN-847 definitions are now documented, but live verification closure is blocked on auth/context prerequisites.
