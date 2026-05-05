# AGN-404 Observability Dashboards - Release SRE Heartbeat (2026-05-05)

Timestamp (local): 2026-05-05
Issue: AGN-404
Wake comment: Re-queue:bumped-concurrency-retry (2026-05-04T16:10:06.271Z)

## Mandatory opening verification
Completed:
- CLAUDE.md
- docs/ENGINE.md
- docs/SITE-WIREMAP.md
- docs/AUDIT-2026-05-04.md
- docs/forensic/00-INDEX.md
- tasks/CURRENT-SPRINT.md
- tasks/BACKLOG.md

Freshness gate:
- Command: `npm run freshness:check`
- Result: FAIL
- Evidence: `GET http://localhost:3023/api/health?soft=1 failed: HTTP 500 Internal Server Error`
- Classification: localhost:3023 is reachable (not missing), product is stale/degraded.

## Live ops evidence

### GitHub Actions workflows (owned surface)
- Command: `gh run list --limit 20 --json workflowName,status,conclusion,createdAt,updatedAt,databaseId`
- Result: FAIL
- Error: `HTTP 401: Bad credentials`
- Command: `gh workflow list`
- Result: FAIL
- Error: `HTTP 401: Bad credentials`
- Outcome: live workflow/cron state cannot be inspected in this heartbeat due to invalid GitHub auth.

### Vercel deploy state (owned surface)
- Command: `vercel ls`
- Result: FAIL
- Error: `You specified VERCEL_PROJECT_ID but forgot VERCEL_ORG_ID`
- Command: `vercel env ls`
- Result: FAIL
- Error: same as above
- Outcome: deployment state and env verification are blocked by CLI context misconfiguration.

### Railway/Redis operational checks (owned surface)
- Command: `railway status`
- Result: PASS
- Evidence: `Project: starscreener`, `Environment: production`, `Service: trendingrepo-worker`
- Command: `railway domain`
- Result: PASS
- Evidence: `https://trendingrepo-worker-production.up.railway.app`
- Command: `GET /healthz` and `GET /health`
- Result: PASS
- Evidence payload: `{ "ok": true, "db": true, "redis": true, "lastRunAt": "2026-05-04T16:30:04.166Z" }`

## Rollback readiness
Current rollback path remains runbook-driven and cannot be executed live this heartbeat due to Vercel CLI context failure:
1. Identify last known-good production deploy in Vercel dashboard.
2. Promote/rollback to that deploy.
3. Verify `https://trendingrepo.com/api/health?soft=1` and critical cron endpoints.
4. Confirm Railway worker health remains green.

## Decision
Status: BLOCKED.

Blocked on:
1. GitHub auth repair (`gh auth`) to inspect live workflow/cron state.
2. Vercel CLI context repair (set both `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`) to verify deploy state and env posture.

Needs:
- Owner: CTO/platform
- Action: restore GitHub and Vercel credentials/context for this runner, then re-run AGN-404 release verification matrix.
