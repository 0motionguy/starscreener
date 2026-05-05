# AGN-853 per-route cost attribution heartbeat (2026-05-05)

## Scope
Issue: AGN-853 `[OBS-8] Per-route cost attribution — track Vercel Lambda invocations per route`
Owner lane: Release SRE

## Mandatory opening evidence
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Freshness command: `npm run freshness:check`
- Result at heartbeat time: `request timed out while contacting http://localhost:3023`.
- Interpretation: localhost:3023 is missing/unreachable for this heartbeat.

## Live ops evidence (release surfaces)
1. GitHub Actions visibility check:
   - Command: `gh run list --workflow sre-actions-visibility.yml --limit 5 --json status,conclusion,createdAt,displayTitle,url`
   - Result: `HTTP 401: Bad credentials`.
   - Impact: cannot inspect live workflow run state from local `gh` session.

2. Vercel auth/project targeting check:
   - Command: `vercel env ls`
   - Result: `Error: You specified VERCEL_PROJECT_ID but you forgot to specify VERCEL_ORG_ID`.
   - Local env evidence:
     - `VERCEL_TOKEN` is present.
     - `VERCEL_PROJECT_ID` is present.
     - `VERCEL_ORG_ID` is missing.
   - `.vercel/project.json` contains linked ids:
     - `projectId: prj_ycY0bM38UMyAl9jPcAgrmQGUc4tQ`
     - `orgId: team_NrVhqhXUDEYB9YOWaqkBIQ4w`

3. Existing SRE workflow baseline reviewed:
   - `.github/workflows/sre-actions-visibility.yml`
   - `.github/workflows/sre-cron-secret-rotation-guard.yml`
   - `.github/workflows/sre-redis-restore-drill.yml`

## AGN-853 status decision
Blocked.

Reason: route-level Vercel Lambda invocation attribution requires working Vercel org/project auth path and live workflow visibility. Current session has broken Vercel org targeting and invalid GitHub CLI credentials, so release-verifiable attribution evidence cannot be produced in this heartbeat.

## Unblock owner/actions
- CTO/platform:
  1. Provide `VERCEL_ORG_ID` alongside `VERCEL_PROJECT_ID` in the execution environment used for SRE checks.
  2. Confirm token scope can read Vercel usage/observability data for project `starscreener`.
- CTO/platform or repo admin:
  3. Restore `gh` authentication for this run context (current state is 401) so workflow-run evidence can be fetched.

## Next action after unblock
- Run Vercel usage/observability pull for last 24h and map invocation counts per route.
- Attach JSON evidence + summary table in AGN-853 follow-up heartbeat.
