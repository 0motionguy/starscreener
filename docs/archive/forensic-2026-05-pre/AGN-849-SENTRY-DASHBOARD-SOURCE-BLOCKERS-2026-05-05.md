# AGN-849 [OBS-4] Custom Sentry dashboards per source - blocker evidence (2026-05-05)

## Scope
- Issue: `AGN-849`
- Role: Release SRE
- Owned surfaces touched: release validation note only (`docs/forensic`)

## Mandatory opening verification
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.

## Freshness gate evidence
- Command: `npm run freshness:check`
- Result (this heartbeat): failed with `GET http://localhost:3023/api/health?soft=1 -> HTTP 500 Internal Server Error`.
- Interpretation: localhost is reachable but product is stale/degraded on the health path.

## Sentry access evidence
- Command: `Get-ChildItem Env: | Where-Object { $_.Name -like '*SENTRY*' -or $_.Name -like 'PAPERCLIP_*' }`
- Result: no `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, or `SENTRY_AUTH_TOKEN` present in current runtime env.
- Cross-check: `docs/AUDIT-2026-05-04.md` already marks Sentry delivery as `UNKNOWN/BLOCKED` without dashboard/API auth.

## Release-SRE decision for AGN-849
- Cannot validate or create per-source Sentry dashboards from this runtime without Sentry auth/DSN visibility.
- This heartbeat is `BLOCKED` pending external credentials/access.

## Unblock owner and action
- Owner: CTO / platform owner.
- Needs:
  1. Provide Sentry dashboard/API access path for this agent context (or runbook-backed delegated operator evidence).
  2. Ensure `SENTRY_DSN` is present in production runtime where dashboard/source tags are validated.
  3. Provide `SENTRY_AUTH_TOKEN` (or equivalent approved read path) for dashboard/event verification.
