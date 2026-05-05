# AGN-1532 Cron Freshness Auth-Path Audit (2026-05-05)

## Scope
- Issue: AGN-1532 `[Sprint 1 audit] Platform Security auth-path audit for cron freshness routes`
- Owned surfaces checked:
  - `src/app/api/cron/freshness/state/route.ts`
  - `src/lib/api/auth.ts`
  - `src/lib/errors.ts`
  - auth coverage tests under `src/lib/__tests__` and freshness route tests

## Mandatory opening evidence
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Freshness command:
  - `npm run freshness:check`
  - Result: `freshness-check: GET http://localhost:3023/api/health?soft=1 failed: HTTP 500 Internal Server Error`
  - Classification: `localhost:3023 reachable (not missing), product stale/degraded`.

## Auth-path verification findings
1. Cron freshness route is gated by cron auth:
   - `src/app/api/cron/freshness/state/route.ts` calls `authFailureResponse(verifyCronAuth(request))` before route body work.
2. Unauthorized + misconfigured cron auth paths are explicit and typed:
   - `src/lib/api/auth.ts` returns:
     - 401 `{ ok: false, reason: "unauthorized" }`
     - 503 `{ ok: false, reason: "CRON_SECRET not configured" }`
3. Token masking policy uses first4+last4:
   - `src/lib/api/auth.ts` -> `maskSecretForAudit(...)` -> `redactToken(...)`
   - `src/lib/github-token-pool.ts` `redactToken` format: `${first4}****${last4}`.
4. Sentry tag context includes source/category for typed errors:
   - `src/lib/errors.ts` + `engineErrorSentryContext(...)`
   - Auth denial responses in `src/lib/api/auth.ts` emit typed `AuthQuarantineError` / `AuthFatalError` / `AdminQuarantineError` / `AdminFatalError` with contextual tags.

## Test evidence (run in this heartbeat)
Command:
- `npx tsx --test src/lib/__tests__/cron-route-typed-error-contract.test.ts src/lib/__tests__/admin-cron-auth-coverage.test.ts src/app/api/cron/freshness/state/__tests__/error-envelope.test.ts src/app/api/cron/freshness/state/__tests__/health-states.test.ts`

Result:
- `tests 43`
- `pass 43`
- `fail 0`

Notable passing checks:
- `cron routes enforce verifyCronAuth gate`
- `[cron auth contract] freshness-state: unauthorized -> 401 typed envelope`
- `[cron auth contract] freshness-state: missing secret -> 503 typed envelope`
- freshness-state error-envelope + health-state tests green.

## Audit conclusion
- Auth-path acceptance for cron freshness route is met in current code and test evidence:
  - Cron secret gate enforced
  - Deny/misconfig responses explicit
  - Secret masking complies first4+last4
  - Typed error/Sentry source-category context present
- No code changes required for AGN-1532 in this heartbeat.
