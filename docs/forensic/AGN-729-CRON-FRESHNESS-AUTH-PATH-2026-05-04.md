# AGN-729 Release SRE heartbeat — cron freshness auth path

Date: 2026-05-04  
Issue: AGN-729  
Owner lane: Release SRE

## Mandatory opening evidence

- Read: `CLAUDE.md`
- Read: `docs/ENGINE.md`
- Read: `docs/SITE-WIREMAP.md`
- Read: `docs/AUDIT-2026-05-04.md`
- Read: `docs/forensic/00-INDEX.md`
- Read: `tasks/CURRENT-SPRINT.md`
- Read: `tasks/BACKLOG.md`
- Ran: `npm run freshness:check`
  - Result: fail
  - Evidence: `GET http://localhost:3023/api/health?soft=1 failed: HTTP 500 Internal Server Error`
  - Interpretation: localhost `:3023` is reachable (not missing) but product is stale/degraded.

## Change made

File changed:
- `.github/workflows/cron-freshness-check.yml`

What changed:
- Updated workflow contract comments to include protected freshness-state auth-path verification.
- Added required secret dependency line for `secrets.CRON_SECRET`.
- Added a new step: `GET /api/cron/freshness/state (auth path)` that:
  - refuses to run when `CRON_SECRET` is unset,
  - calls `"$BASE_URL/api/cron/freshness/state"` with `Authorization: Bearer $CRON_SECRET`,
  - fails the workflow on non-`200`.

Why:
- Release verification was only checking unauthenticated `/api/health`.
- Production freshness release checks also depend on protected `/api/cron/freshness/state`.
- This closes the gap by proving both route health and auth path in the scheduled SRE probe.

## Rollback

If this causes unexpected failures, rollback is a single-file revert:

- Revert `.github/workflows/cron-freshness-check.yml` to previous revision.
- Re-run workflow_dispatch once to confirm old behavior restored.

