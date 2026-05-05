---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# Rollback Runbook (AGN-130)

Scope: STARSCREENER release rollback on Vercel, GitHub Actions workflow revert, and Railway worker redeploy.

## 1) Vercel app rollback (production)

When to use:
- New deploy introduces runtime errors/regressions on `trendingrepo.com`.
- Do not use for isolated data staleness where runtime is healthy; repair collector/workflow first.

Pre-check:
- `curl -s https://trendingrepo.com/api/health?soft=1`
- If `status=stale` but endpoint is healthy, investigate workflows before rollback.

Procedure:
1. Ensure env context is correct:
   - `VERCEL_ORG_ID=<team_...>`
   - `VERCEL_PROJECT_ID=<prj_...>`
2. List deployments:
   - `vercel ls --prod --yes`
3. Roll back to prior healthy deployment:
   - `vercel rollback --yes`
4. Post-rollback verify:
   - `curl -s https://trendingrepo.com/api/health?soft=1`
   - `curl -s https://trendingrepo.com/api/cron/freshness/state -H "Authorization: Bearer $CRON_SECRET"`

## 2) Revert a GitHub workflow change

When to use:
- A workflow file change under `.github/workflows/**` causes failures or harmful cadence overlap.

Procedure:
1. Identify bad commit and workflow:
   - `gh run list --limit 30 --json workflowName,conclusion,createdAt,url`
2. Revert only the workflow commit (no broad reset):
   - `git revert <bad_commit_sha>`
3. Push and watch next run.
4. Optionally rerun the failed run:
   - `gh run rerun <run-id>`

## 3) Railway worker redeploy

When to use:
- Worker health fails (`db=false`, `redis=false`, repeated runtime errors), or worker deploy introduced regression.

Procedure:
1. Check worker health:
   - `curl -s https://trendingrepo-worker-production.up.railway.app/healthz`
2. Redeploy prior known-good commit from Railway UI/CLI.
3. Re-check health endpoint until:
   - `ok=true`, `db=true`, `redis=true`.

## 4) Dry-run evidence (no rollback executed)

Date: 2026-05-04

Dry-run step executed:
- `vercel rollback --yes`

Observed result:
- Command failed before any rollback action with: missing `VERCEL_ORG_ID` while `VERCEL_PROJECT_ID` is set.

Conclusion:
- Rollback mechanism path is validated at command level, and no actual rollback was executed in this dry-run.