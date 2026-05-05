# AGN-1042 Admin/Auth Boundary Review (2026-05-05)

## Mandatory opening + preflight

- Verified mandatory reads completed:
  - `CLAUDE.md`
  - `docs/ENGINE.md`
  - `docs/SITE-WIREMAP.md`
  - `docs/AUDIT-2026-05-04.md`
  - `docs/forensic/00-INDEX.md`
  - `tasks/CURRENT-SPRINT.md`
  - `tasks/BACKLOG.md`
- Ran `npm run freshness:check` at this heartbeat.
- Result: localhost `3023` is reachable (not missing), but stale/degraded because `/api/health?soft=1` returned `HTTP 500 Internal Server Error`.

## Scope reviewed (platform security owned surfaces)

- `src/app/api/admin/**`
- auth/session verification:
  - `src/lib/api/auth.ts`
  - `src/lib/api/admin-session.ts`
- typed error paths:
  - `src/lib/errors.ts`
- Sentry/error visibility in admin auth/login/sentry verify routes
- `.env.example` secret shape entries for Sentry + ops webhook
- `OPS_ALERT_WEBHOOK` fatal/recoverable paths:
  - `src/lib/github-fetch.ts`
  - `src/lib/pool/twitter-fallback.ts`
  - `src/lib/security/subdomain-takeover.ts`

## Evidence checks

1. Secret masking contract (first4+last4)
- `src/lib/github-token-pool.ts` uses `redactToken()` with `first4 + **** + last4`.
- `src/lib/api/auth.ts` uses `maskSecretForAudit()` with `first4 + *** + last4` and never stores full bearer tokens in Sentry audit tags/extra.
- `src/app/api/admin/pool-state/route.ts` labels/fingerprints for output are derived from redacted token labels, not raw PAT values.

2. Admin/auth deny and quarantine behavior
- `verifyAdminAuth()` enforces:
  - IP blocklist deny (`403`) with `AdminQuarantineError`.
  - unauthorized (`401`) with `AdminQuarantineError`.
  - missing `ADMIN_TOKEN` (`503`) with `AdminFatalError`.
- `src/app/api/admin/login/route.ts` enforces:
  - brute-force + escalation rate limits (`429`) with `AdminQuarantineError`.
  - invalid credentials/MFA (`401`) with `AdminQuarantineError`.
  - missing admin login config (`503`) with `AdminFatalError`.

3. Fatal paths + explicit config gating
- `src/app/api/admin/sentry-verify/route.ts` blocks with `503 SENTRY_NOT_CONFIGURED` when `SENTRY_DSN` is absent.
- `OPS_ALERT_WEBHOOK` callsites create explicit `OpsAlertFatalError` when missing and `OpsAlertRecoverableError` on delivery failure.

4. Sentry source/category tagging
- `src/lib/errors.ts` provides typed `source` + `category` via `EngineError`.
- `engineErrorSentryContext()` is used in admin/auth routes to attach structured tags/extra.
- `verifyAdminAuth()` emits `admin_auth_audit` with tags including `source`, `category`, `auth_surface`, `auth_verdict`, `route`, and `method`.

## Verification command results

- `npm run freshness:check`:
  - failed with `GET http://localhost:3023/api/health?soft=1 failed: HTTP 500 Internal Server Error`
- Targeted test run:
  - `npx vitest run src/app/api/admin/queues/repo/__tests__/masking.test.ts src/app/api/admin/pool-state/__tests__/auth.test.ts src/app/api/admin/scan/__tests__/rate-limit.test.ts`
  - result: `No test files found` due to current Vitest include globs.

## Outcome

- No new code patch required in owned security surfaces for AGN-1042 based on current verification.
- Residual platform blocker remains freshness endpoint failure (`/api/health?soft=1` 500), outside AGN-1042 scoped code changes.
