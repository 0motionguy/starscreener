# Sentry Readiness and DSN Exposure Checklist (AGN-269)

Date: 2026-05-04
Owner: Platform Security
Scope: runtime/app Sentry wiring, canary path, DSN exposure controls

## 1) Where DSN presence is checked and logged

- Runtime startup checks:
  - `instrumentation.ts` -> `register()` logs:
    - missing DSN: `[STARTUP] SENTRY_DSN not configured - runtime errors will not be reported`
    - present DSN: logs DSN length only, never value
  - `src/instrumentation.ts` mirrors the same guard/log behavior.
- Verification helper:
  - `src/lib/sentry-verification.ts` -> `sentryDsnConfigured()` checks:
    - `SENTRY_DSN` OR `NEXT_PUBLIC_SENTRY_DSN`
- Freshness gate:
  - `scripts/check-freshness.mts` reports Sentry state from local runtime env and marks `Sentry: MISSING` when DSN is absent.

## 2) Missing-DSN blast radius (current behavior)

- `POST /api/admin/sentry-verify`
  - Admin-authenticated route.
  - Returns `503` with `SENTRY_NOT_CONFIGURED` when DSN is missing.
- `GET /api/%5Finternal/sentry-canary`
  - Requires cron auth and `SENTRY_CANARY_ENABLED=1`.
  - Fires Sentry event and throws typed `SentryCanaryError` when enabled.
  - If DSN is missing, event delivery cannot be confirmed.
- Global runtime capture:
  - `onRequestError = Sentry.captureRequestError` is wired, but without DSN events will not reach provider.

## 3) DSN exposure verification (masking-compliant)

- No DSN value is returned by inspected admin APIs in this scope.
- Startup logs disclose only DSN presence/length, not secret value.
- Token-related admin telemetry uses redaction (`redactToken`) and avoids full secret output.
- `.env.example` defines Sentry variable names only:
  - `NEXT_PUBLIC_SENTRY_DSN`
  - `SENTRY_DSN`
  - `SENTRY_AUTH_TOKEN`
  - `SENTRY_ORG`
  - `SENTRY_PROJECT`

## 4) Secure rollout checklist for enablement + canary

1. Provision `SENTRY_DSN` in Vercel runtime env (all relevant environments).
2. Keep `NEXT_PUBLIC_SENTRY_DSN` aligned only if browser capture is intended.
3. Provision `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` for source map and operational tooling.
4. Set `SENTRY_CANARY_ENABLED=1` in controlled environments.
5. Run canary with cron auth:
   - `npm run freshness:check -- --sentry-canary`
6. Confirm:
   - canary route returns/throws as expected and prints canary event id/log marker
   - Sentry dashboard receives event with tags:
     - `source=sentry-canary`
     - `category=fatal`
     - `canary=true`
7. Re-run:
   - `npm run freshness:check`
   - expect `Sentry: CONFIGURED` or `TEST_FIRED` (when canary mode is used).
8. Turn `SENTRY_CANARY_ENABLED` off outside explicit test windows if continuous canaries are not desired.

## 5) Current status snapshot

- Latest local check in this heartbeat:
  - `npm run freshness:check` (2026-05-04T13:12:08.854Z)
  - localhost reachable, but non-green freshness remains and `Sentry: MISSING`.
- Readiness conclusion:
  - Wiring and guardrails are present.
  - Live provider verification is blocked until DSN/provider access is available.
