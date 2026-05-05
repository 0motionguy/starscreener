# AGN-1288 CSP/CORS Posture Verification Refresh (2026-05-05)

## Scope
- Issue: `AGN-1288` (`[Sprint 1 audit] CSP/CORS posture verification refresh`)
- Owner lane: Platform Security
- Verification surfaces only:
  - `next.config.ts` CSP/security headers
  - `src/app/portal/route.ts` CORS handling
  - `src/app/portal/call/route.ts` CORS handling
  - `.env.example` secret/config shape for CORS allowlist

## Mandatory opening + freshness preflight
- Mandatory docs re-read completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- `npm run freshness:check` result:
  - `GET http://localhost:3023/api/health?soft=1 failed: HTTP 500 Internal Server Error`
  - Localhost is reachable (not missing) but product is stale/degraded.

## Evidence: CSP
- `next.config.ts:119-170` confirms security headers are configured in `async headers()`:
  - `Content-Security-Policy` is set in production (`next.config.ts:164`).
  - `Strict-Transport-Security` remains set (`next.config.ts:161-163`).
  - `Content-Security-Policy-Report-Only` is conditionally emitted when Sentry report URI exists (`next.config.ts:165-167`).
- `src/lib/security/csp-starter.ts` confirms CSP is built from explicit sources (self + allowlisted analytics/image/connect domains), not wildcard reflection.

## Evidence: CORS
- `/portal` (`src/app/portal/route.ts:42-116`):
  - Allowed origins are built from explicit env/public URL allowlist inputs.
  - Disallowed origins are denied with `403` and `code: CORS_DENIED`.
  - `Access-Control-Allow-Origin` is only reflected when origin is allowlisted.
- `/portal/call` (`src/app/portal/call/route.ts:30-101`):
  - Same origin normalization + allowlist pattern.
  - `OPTIONS` and `POST` both enforce deny-on-disallowed-origin.
- Env/config surface (`.env.example:138-141`) documents `PORTAL_CORS_ALLOWED_ORIGINS`.

## Verification commands + outputs
- Route unit tests:
  - Command:
    - `npx tsx --test src/app/portal/__tests__/cors.route.test.ts src/app/portal/call/__tests__/cors.route.test.ts`
  - Result:
    - `pass 4`, `fail 0`.
- Live local header probe attempt:
  - `curl.exe -i -X OPTIONS http://localhost:3023/portal ...`
  - Returned `HTTP/1.1 500 Internal Server Error` due to current local app degraded state (same freshness failure path), so runtime header reflection could not be re-validated from localhost this heartbeat.

## Security verdict (refresh)
- CSP posture: **present in current codebase** (production header path is configured).
- Portal CORS posture: **allowlist-based with explicit deny on disallowed origin**, validated by route tests.
- Residual blocker for live localhost probe: existing local `500` health degradation outside this issue scope.
