# Vercel Deploy Failing Runbook

Target MTTR: <= 30 minutes

## Symptoms
- PRs merge and CI is green, but `https://trendingrepo.com` does not reflect new commit.
- Vercel deployment list shows failed/stuck build or alias not updated.
- Release verification from CLI may fail if org/project context is broken.

## Diagnosis
1. Check Vercel dashboard deployments for latest `main` commit.
2. Check Vercel CLI context:
   - `vercel env ls`
   - If error says `VERCEL_PROJECT_ID` set without `VERCEL_ORG_ID`, fix context first.
3. Compare production response artifact/version with expected commit.

## Mitigation (30-min path)
1. Open Vercel dashboard -> latest failed deployment -> inspect build/function error.
2. Fix blocking env/config issue and trigger manual redeploy.
3. Verify alias `trendingrepo.com` now points to expected deployment.
4. Confirm health endpoints and key route smoke checks.

## Real Example (Past Quarter)
- 2026-05-04 and 2026-05-05 forensic runs repeatedly showed Vercel release verification blocked by org/project context drift (`VERCEL_ORG_ID` missing), preventing authenticated deploy-state checks. See `docs/archive/forensic-2026-05-pre/AGN-739-RUNBOOKS-4-MOST-LIKELY-INCIDENTS-2026-05-04.md` and `docs/archive/forensic-2026-05-pre/AGN-604-RUNTIME-WORKFLOW-ENV-DRIFT-2026-05-05.md`.

## Rollback
- Promote last known healthy deployment from Vercel dashboard (or revert offending merge and redeploy), then re-run release validation smoke checks.
