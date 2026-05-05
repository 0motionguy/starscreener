# AGN-358 Sentry + Fatal Alert Coverage Audit (2026-05-04)

Scope constrained to Platform Security owned surfaces:
- `src/app/api/admin/**`
- auth/session verification (`src/lib/api/auth.ts`)
- fatal/quarantine categories in `src/lib/errors.ts`
- Sentry structured logging
- `.env.example` secret shape
- `OPS_ALERT_WEBHOOK` fatal path behavior

Verification method:
- direct source grep + file inspection in this heartbeat
- targeted tests for touched security telemetry paths

## Coverage map (verified)

| Surface | Verified behavior | Evidence |
|---|---|---|
| Admin auth deny/not-configured | Unauthorized -> `AdminQuarantineError`; missing config -> `AdminFatalError`; both sent to Sentry with `engineErrorTags` (`source`,`category`) + `auth_surface` | `src/lib/api/auth.ts` |
| Admin login | Rate-limited/unauthorized/not-configured paths emit Sentry `captureException` with `engineErrorTags` and `auth_surface=admin-login` | `src/app/api/admin/login/route.ts` |
| Sentry canary route | `/api/admin/sentry-verify` gates on DSN and emits synthetic recoverable/quarantine/fatal events with tags from `verificationTags()` | `src/app/api/admin/sentry-verify/route.ts`, `src/lib/sentry-verification.ts` |
| Fatal ops alert path | Twitter all-sources-failed emits fatal Sentry event; missing `OPS_ALERT_WEBHOOK` explicitly captured as ops-alert blocked error; webhook delivery failure captured as recoverable | `src/lib/pool/twitter-fallback.ts` |
| Secret shape | `OPS_ALERT_WEBHOOK`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` present in env template | `.env.example` |
| Token masking | Redaction format remains first4+last4 shape | `src/lib/github-token-pool.ts`, `src/lib/__tests__/github-token-pool.test.ts` |

## Gap matrix

| ID | Severity | Gap | Status |
|---|---|---|---|
| G1 | Medium | GitHub pool Sentry events previously lacked explicit `source/category` tags on exhaustion/low-quota/quarantine events | Fixed in this heartbeat |
| G2 | Medium | No live Sentry provider verification possible in this runtime (`SENTRY_DSN`/provider access unavailable), so event delivery and alert routing cannot be proven end-to-end | Open (external) |

## Patch-ready recommendations

1. Landed patch (G1): keep explicit `source=github` and category tags on all GitHub pool Sentry events.
   - File: `src/lib/github-token-pool.ts`
   - Implemented:
     - exhaustion: `category=fatal`
     - low quota: `category=recoverable`
     - quarantine: `category=quarantine`

2. External unblock (G2): CTO/platform to provision runtime `SENTRY_DSN` and project access; then execute:
   - `POST /api/admin/sentry-verify` with kinds `recoverable`, `quarantine`, `fatal`
   - confirm tags include at least `source` and `category`
   - confirm fatal/quarantine events route to expected alerts/on-call

## Command evidence

- `npm run freshness:check` => localhost reachable (`3023`), stale/degraded, `Sentry: MISSING`.
- `npx tsx --test src/lib/__tests__/github-token-pool.test.ts` => pass (23/23)
- `npx tsx --test src/app/api/admin/pool-state/__tests__/auth.test.ts` => pass (4/4)

## Conclusion

Code-level audit acceptance is met for mapping, gap identification, and patch-ready recommendations.
End-to-end Sentry delivery verification remains blocked on external DSN/provider access.
