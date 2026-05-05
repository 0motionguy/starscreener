---
status: archive
audit-date: 2026-05-05
reason: dated release-validation heartbeat artifact
---

# AGN-182 Vercel Cron Route Health Probe Matrix

Timestamp: 2026-05-04T16:25:04+08:00
Operator: Release SRE

## Mandatory preflight
- `npm run freshness:check` executed locally against `http://localhost:3023`.
- Result: `localhost:3023` reachable (not missing).
- Result: `health=stale sourceStatus=degraded` due to `Sentry: MISSING`.
- Freshness row summary: `green=50 yellow=0 red=0 dead=0 blocking_non_green=0 advisory_non_green=0`.

## Production liveness split: stale deploy vs code failure
- `https://trendingrepo.com/api/health?soft=1` => HTTP 200.
- `https://trendingrepo-worker-production.up.railway.app/healthz` => HTTP 200.
- Interpretation: app + worker are live; current degraded state is configuration/observability (`Sentry: MISSING`), not hard runtime outage.

## Cron route probe matrix (production, unauthenticated)
Expected behavior for protected cron endpoints is HTTP 401 without `Authorization: Bearer <CRON_SECRET>`.

| Route | Method | Unauth Status | Outcome |
|---|---|---:|---|
| `/api/cron/aiso-drain` | POST | 401 | Guard healthy |
| `/api/cron/digest/weekly` | POST | 401 | Guard healthy |
| `/api/cron/llm/aggregate` | GET | 401 | Guard healthy |
| `/api/cron/llm/sync-models` | GET | 401 | Guard healthy |
| `/api/cron/mcp/rotate-usage` | POST | 401 | Guard healthy |
| `/api/cron/predictions` | POST | 401 | Guard healthy |
| `/api/cron/twitter-daily` | POST | 401 | Guard healthy |
| `/api/cron/twitter-weekly-recap` | POST | 401 | Guard healthy |
| `/api/cron/webhooks/flush` | POST | 401 | Guard healthy |
| `/api/cron/webhooks/scan` | POST | 401 | Guard healthy |

Note: Authenticated execution probes were not run in this heartbeat because local shell has no `CRON_SECRET` exported.

## Live workflow state (GitHub Actions)
Sampled from latest runs (`gh run list --limit 200`).

| Workflow | Latest status | Created (UTC) | Link |
|---|---|---|---|
| Cron - freshness check | failure | 2026-05-04T07:45:27Z | https://github.com/0motionguy/starscreener/actions/runs/25307217625 |
| Cron - pipeline ingest | failure | 2026-05-04T07:22:19Z | https://github.com/0motionguy/starscreener/actions/runs/25306346494 |
| Refresh agent-commerce pipeline | failure | 2026-05-04T07:34:48Z | https://github.com/0motionguy/starscreener/actions/runs/25306822428 |
| Cron - webhooks flush + scan | success | 2026-05-04T07:53:50Z | https://github.com/0motionguy/starscreener/actions/runs/25307541395 |
| Source health watch | success | 2026-05-04T08:04:25Z | https://github.com/0motionguy/starscreener/actions/runs/25307981908 |

## Vercel deployment-state check
- `vercel ls --yes` failed due to local auth context mismatch:
  - `VERCEL_PROJECT_ID` present while `VERCEL_ORG_ID` missing.
- This is an ops blocker for direct CLI deploy-state confirmation from this shell.

## Rollback readiness
Current rollback path is available and documented:
1. Identify last known-good production deployment in Vercel dashboard (project `starscreener`).
2. Promote/rollback to that deployment in Vercel.
3. Re-run `npm run freshness:check -- --prod --timeout-ms 30000` locally with valid `CRON_SECRET` to verify state.
4. Validate critical endpoints:
   - `/api/health?soft=1` must return 200.
   - Protected cron routes must return 401 unauth and 2xx with valid bearer in workflow context.

## Ownership / unblock
- Blocker owner: CTO/Platform (Vercel access env alignment + Sentry DSN completion).
- Needed to close remaining risk: provide Vercel org/project auth parity in CLI context and complete Sentry DSN provisioning evidence.
