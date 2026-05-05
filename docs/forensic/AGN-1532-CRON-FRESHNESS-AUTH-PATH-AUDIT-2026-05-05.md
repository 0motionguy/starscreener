# AGN-1532 Cron Freshness Auth-Path Audit (2026-05-05)

## Scope
- Route: `src/app/api/cron/freshness/state/route.ts`
- Shared auth: `src/lib/api/auth.ts`
- Validation tests: `src/lib/api/__tests__/auth.test.ts`

## Mandatory opening + freshness gate
- Required docs read in this heartbeat except `docs/AUDIT-2026-05-04.md` (path missing in current tree).
- `npm run freshness:check` result: `request timed out while contacting http://localhost:3023`.
- Interpretation: localhost:3023 unreachable in this heartbeat (missing from freshness perspective).

## Auth gate and caller identity
- `GET /api/cron/freshness/state` calls `authFailureResponse(verifyCronAuth(request))` before route logic.
- Expected caller identity: internal cron/job caller presenting `Authorization: Bearer $CRON_SECRET` (or raw secret format accepted by helper).
- Deny behavior:
  - invalid/missing auth -> `401 { ok:false, reason:"unauthorized" }`
  - missing `CRON_SECRET` in production -> `503 { ok:false, reason:"CRON_SECRET not configured" }`

## Risk-ranked findings
1. **High (closed): cron auth denials lacked typed Sentry quarantine/fatal telemetry**
   - Prior state: deny responses were clear, but no typed Sentry capture on cron denial path.
   - Fix applied in `src/lib/api/auth.ts`:
     - unauthorized -> `AuthQuarantineError` + Sentry tags (`source=auth`, `category=quarantine`, `auth_surface=cron`)
     - not_configured -> `AuthFatalError` + Sentry tags (`source=auth`, `category=fatal`, `auth_surface=cron`)
   - Owner: Platform Security.
   - Status: **Resolved in this heartbeat**.

2. **Medium (open, external): localhost freshness check endpoint unavailable**
   - `npm run freshness:check` cannot contact localhost:3023 in this heartbeat.
   - Owner: Platform/Infra runtime operator.
   - Unblock action: restore local app reachability at `http://localhost:3023` and rerun freshness gate.

## Secret leakage checks
- No token value is serialized in cron deny response bodies.
- Admin token masking path remains redacted (`first4+last4`) through existing `redactToken` usage in auth audit messages.

## Verification evidence
- Command: `npx tsx --test src/lib/api/__tests__/auth.test.ts`
- Result: `32/32` passing (includes new cron authFailureResponse Sentry-tag assertions).

## Files changed for AGN-1532
- `src/lib/api/auth.ts`
- `src/lib/api/__tests__/auth.test.ts`
- `docs/forensic/AGN-1532-CRON-FRESHNESS-AUTH-PATH-AUDIT-2026-05-05.md`
