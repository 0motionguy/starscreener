# AGN-202 Cron Route and Health Endpoint Availability Matrix

Timestamp: 2026-05-04T16:47:00+08:00
Operator: Release SRE

## Mandatory preflight
- `npm run freshness:check` executed locally.
- Result: freshness check timed out contacting `http://localhost:3023`.
- Interpretation: localhost is effectively missing/unavailable for this heartbeat, so local product freshness is stale until app is restored.

## Production liveness split: stale deploy vs code failure
- `https://trendingrepo.com/api/health?soft=1` => HTTP 200, payload `status:"stale"`, `sourceStatus:"degraded"`.
- `https://trendingrepo-worker-production.up.railway.app/healthz` => HTTP 200, payload `ok:true`, `db:true`, `redis:true`.
- Interpretation: production app + worker are live; this indicates stale/degraded data state, not a hard runtime outage.

## Cron route availability matrix (production, unauthenticated)
Expected behavior for protected cron endpoints is HTTP 401 when no `Authorization: Bearer <CRON_SECRET>` is provided.

| Route | Method | Unauth status | Outcome |
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

Note: initial GET probes to twitter outbound routes returned 405; corrected POST probes returned expected 401.

## Route-to-workflow wiring evidence
Confirmed from `.github/workflows`:
- `cron-aiso-drain.yml` -> `POST /api/cron/aiso-drain`
- `cron-digest-weekly.yml` -> `POST /api/cron/digest/weekly`
- `cron-llm.yml` -> `GET /api/cron/llm/aggregate`, `GET /api/cron/llm/sync-models`
- `cron-mcp-usage-rotate.yml` -> `POST /api/cron/mcp/rotate-usage`
- `cron-predictions.yml` -> `POST /api/cron/predictions`
- `cron-twitter-outbound.yml` -> `POST /api/cron/twitter-daily` and `POST /api/cron/twitter-weekly-recap`
- `cron-webhooks-flush.yml` -> `POST /api/cron/webhooks/scan` and `POST /api/cron/webhooks/flush`

## Live workflow state sample (GitHub Actions)
Sampled from latest runs (`gh run list --limit 200`):
- `Refresh fast discovery` -> `in_progress` (2026-05-04T08:43:35Z)
- `Cron - freshness check` -> latest failure (2026-05-04T07:45:27Z), earlier success (2026-05-04T04:55:48Z)
- `Cron - pipeline ingest` -> latest failure (2026-05-04T07:22:19Z)
- `Cron - webhooks flush + scan` -> success (2026-05-04T07:53:50Z)
- `Source health watch` -> success (2026-05-04T08:04:25Z)

## Vercel deploy-state check
- `vercel ls --yes` failed in this shell because `VERCEL_PROJECT_ID` is set while `VERCEL_ORG_ID` is missing.
- Result: direct Vercel CLI deploy-state verification is blocked in this environment.

## Rollback readiness
Rollback path remains documented and viable:
1. Select last known-good deployment in Vercel `starscreener` project dashboard.
2. Promote/rollback that deployment.
3. Re-run production verification:
   - `https://trendingrepo.com/api/health?soft=1` must return 200.
   - Cron routes must return 401 unauth, and 2xx in authenticated workflow execution.
4. Re-run `npm run freshness:check -- --prod --timeout-ms 30000` from an environment with valid auth/secret context.

## Blockers and owner
- Blocker 1: local app availability (`localhost:3023`) for mandatory freshness preflight.
- Blocker 2: Vercel CLI auth parity (`VERCEL_ORG_ID` missing) for in-shell deploy-state checks.
- Unblock owner: CTO/Platform.
