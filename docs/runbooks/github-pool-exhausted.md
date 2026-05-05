# GitHub Pool Exhausted Runbook

Target MTTR: <= 30 minutes

## Symptoms
- `/repo/[owner]/[name]` and compare surfaces return intermittent 5xx.
- `/admin/keys` shows all GitHub tokens near or at quota floor.
- Sentry events include `github-pool-5xx` or pool exhaustion signals.

## Diagnosis
1. Confirm current pool state in admin:
   - `/admin/keys`
   - `/admin/pool-aggregate`
2. Confirm runtime errors mention GitHub token exhaustion/quarantine.
3. Verify auth/observability lane works:
   - `gh auth status`
   - `gh run list --limit 20 --json workflowName,status,conclusion,createdAt`

## Mitigation (30-min path)
1. Add at least one fresh PAT to `GH_TOKEN_POOL` (preferred) in production env.
2. Redeploy/restart runtime so pool reloads env.
3. Verify token selection recovers:
   - `/admin/pool-aggregate` shows non-exhausted token.
4. Recheck affected pages and `/api/health?soft=1`.

## Real Example (Past Quarter)
- 2026-05-04: GitHub pool audit captured operator visibility and pool-state gaps, including mixed env naming (`GH_TOKEN_POOL` vs `GITHUB_TOKEN_POOL`) and verification drift risk. See `docs/archive/forensic-2026-05-pre/AGN-720-CTO-GITHUB-POOL-AUDIT-2026-05-04.md`.

## Rollback
- If newly added token causes auth errors, remove that token from pool env, redeploy, and revert to last known good token set.
