# AGN-555 - Release SRE heartbeat evidence (pipeline ingest -> Railway queue)

Date: 2026-05-04  
Owner: [OPS] Release SRE

## Mandatory opening + freshness result
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` result in this heartbeat:
  - `localhost:3023` is reachable (not missing).
  - Fails stale/degraded because `GET /api/health?soft=1` returned HTTP 500.

## AGN-555 implementation-state verification
- Current cron caller remains Vercel route:
  - `.github/workflows/cron-pipeline-ingest.yml` still POSTs `"$BASE_URL/api/pipeline/ingest"`.
- Current `/api/pipeline/ingest` is still Vercel-serverless execution:
  - `src/app/api/pipeline/ingest/route.ts` sets `runtime = "nodejs"` and `maxDuration = 300`.
- Railway worker path check:
  - `apps/trendingrepo-worker/src/server.ts` exposes only `/health` and `/healthz`.
  - `apps/trendingrepo-worker/src/registry.ts` has no `pipeline-ingest` fetcher registered.
  - `apps/trendingrepo-worker/src/fetchers/github/index.ts` is a stub (`not yet implemented`).

Conclusion: AGN-555 target state ("move /api/pipeline/ingest execution to Railway worker queue") is not yet implementable from existing worker surfaces in this branch without adding a new worker fetcher/trigger path.

## Live ops blockers (this heartbeat)
1. GitHub Actions live verification blocked:
   - `gh run list --workflow cron-pipeline-ingest.yml ...` -> `HTTP 401 Bad credentials`.
   - Cannot produce current run-state proof until GitHub auth is restored.
2. Paperclip terminal patch blocked:
   - `GET $PAPERCLIP_API_URL/api/issues/$PAPERCLIP_TASK_ID` -> `Unable to connect to the remote server` (`http://192.168.192.1:3100`).
   - Required issue comment + terminal status PATCH could not be delivered from this runtime.

## Required unblock actions
- CTO/Platform: restore GitHub CLI auth for this runtime (`gh auth login` with repo/actions read scope).
- CTO/Platform: restore Paperclip API network reachability to `http://192.168.192.1:3100` for this agent runtime.
- Backend/Data Pipeline owner: add a real Railway worker ingest fetcher/queue trigger and register it in worker registry; then switch cron caller away from Vercel route.

## Rollback readiness
- No deploy-impacting code was changed in this heartbeat.
- Existing rollback remains unchanged: keep `cron-pipeline-ingest` paused/guarded if 504s persist until worker-queue path is live and verified.
