# AGN-289 - Sentry Readiness Verification Checklist (Phase 1.5)

Timestamp (UTC): 2026-05-04T11:03:00Z
Owner: Release QA

## Scope

Validate QA evidence quality for:
- `SENTRY_DSN` presence state
- canary route behavior
- freshness-row interpretation

## Binary Checklist

| Check | Evidence | Verdict |
|---|---|---|
| Sentry DSN presence in production runtime | `docs/forensic/06-SENTRY-VERIFICATION.md` states Vercel production missing `SENTRY_DSN`; worker has DSN | FAIL |
| Canary route implementation exists and is gated | `src/app/api/%5Finternal/sentry-canary/route.ts` present; requires cron auth and `SENTRY_CANARY_ENABLED=1` | PASS |
| Canary event proof (event ID + URL) | Not available because Vercel DSN is missing | FAIL |
| Freshness interpretation can include Sentry row | Earlier runs showed `Sentry: MISSING`; current run failed with HTTP 401 on freshness endpoint | BLOCKED (env/auth) |

## Blocker Separation (required)

1. Missing-secret blocker (product/config):
- Blocker: Vercel production missing `SENTRY_DSN`.
- Impact: Cannot produce production Sentry canary event proof.
- Owner/action: CTO/platform sets `SENTRY_DSN` in Vercel production.

2. Environment/auth blocker (verification path):
- Blocker: `npm run freshness:check` now returns `HTTP 401` from `GET /api/cron/freshness/state`.
- Impact: Current local preflight cannot be interpreted as source freshness truth without auth fix.
- Owner/action: Platform engineer restores authorized freshness-check path for QA replay.

3. Code-regression blocker:
- Result: NOT OBSERVED in this heartbeat for canary route existence/gating.

## Sign-off Replay Commands

Run after unblock actions:

```powershell
# 1) Local freshness replay (expect exit 0 and no auth failure)
npm run freshness:check

# 2) Canary route auth sanity (expect 404 when disabled, non-401)
curl.exe -i -H "Authorization: Bearer $env:CRON_SECRET" http://localhost:3023/api/_internal/sentry-canary

# 3) Production canary fire (expect event capture path once DSN is configured)
curl.exe -i -H "Authorization: Bearer $env:CRON_SECRET" https://trendingrepo.com/api/_internal/sentry-canary
```

Expected final acceptance evidence:
- `Sentry: READY` (or no missing-DSN signal) in freshness checks.
- Production canary response captured.
- Sentry event ID + event URL recorded in `docs/forensic/06-SENTRY-VERIFICATION.md`.

## QA Verdict

Phase 1.5 Sentry readiness remains **RED/BLOCKED** due to missing Vercel `SENTRY_DSN` plus current freshness auth-path blocker (`HTTP 401`).
