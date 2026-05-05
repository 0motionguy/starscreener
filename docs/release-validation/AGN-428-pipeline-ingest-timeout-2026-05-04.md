# AGN-428 Release Validation - /api/pipeline/ingest 504 timeout decision

Date: 2026-05-04
Owner: [OPS] Release SRE

## Mandatory opening + freshness gate
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` at `2026-05-04T12:38:54.357Z`: localhost:3023 reachable (not missing), but stale/degraded (`blocking_non_green=1`, `producthunt` YELLOW; advisory `model-usage` DEAD; `Sentry: MISSING`).

## Live evidence for ingest 504
- Workflow: `cron-pipeline-ingest.yml`
- Last 10 runs: all failed (queried with `gh run list --workflow cron-pipeline-ingest.yml --limit 10 ...`).
- Latest failed run: `25313791050` (`2026-05-04T10:23:58Z`)
  - URL: https://github.com/0motionguy/starscreener/actions/runs/25313791050
  - Log evidence (`gh run view 25313791050 --log`):
    - `HTTP 504`
    - `FUNCTION_INVOCATION_TIMEOUT`
    - `pipeline/ingest call failed (504)`

## Code/config verification (current HEAD)
- Route file `src/app/api/pipeline/ingest/route.ts` already sets:
  - `export const runtime = "nodejs";`
  - `export const maxDuration = 300;`
- Workflow caller file `.github/workflows/cron-pipeline-ingest.yml`:
  - Calls `POST $BASE_URL/api/pipeline/ingest` with `CRON_SECRET`
  - Job timeout is `timeout-minutes: 10` (GitHub Actions side).
- Conclusion: code-level maxDuration increase is already present; persistent 504 indicates deployment/runtime timeout tier mismatch or stale deploy not carrying current route config.

## Decision (release SRE)
- Do not ship additional timeout code edits in this heartbeat.
- Classify AGN-428 as BLOCKED pending platform action:
  1. Verify Vercel project/function timeout tier limits for this deployment.
  2. Verify production deploy SHA contains current `src/app/api/pipeline/ingest/route.ts` with `maxDuration = 300`.
  3. If tier cap is below 300s, either raise plan/tier or split ingest workload (smaller batches / async fan-out).

## Rollback readiness
- No deploy-impacting code changes made in this heartbeat.
- Immediate rollback path remains: disable/pause `cron-pipeline-ingest.yml` schedule or gate route via CRON auth while platform timeout tier is corrected.