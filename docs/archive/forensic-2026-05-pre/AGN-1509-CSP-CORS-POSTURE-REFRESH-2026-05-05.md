# AGN-1509 CORS/CSP posture refresh (2026-05-05)

## Scope
- Issue: `AGN-1509` (`[Sprint 1 audit] Platform Security CORS/CSP posture refresh`)
- Owner lane: Platform Security
- Surfaces verified:
  - `next.config.ts` security/CSP headers
  - `src/app/portal/route.ts` CORS behavior
  - `src/app/portal/call/route.ts` CORS behavior
  - `.env.example` secret/config shape relevant to CORS/CSP/auth alerts

## Mandatory opening + freshness gate
- Opened required docs in order: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran `npm run freshness:check` on `2026-05-05`:
  - Result: `GET http://localhost:3023/api/cron/freshness/state failed: HTTP 500 Internal Server Error`
  - Verdict: localhost reachable (not missing), product stale/degraded.

## Static verification evidence

### CSP/security headers
- `next.config.ts` sets baseline security headers on `/:path*` (prod + dev):
  - `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`.
- Production-only headers include:
  - `Strict-Transport-Security`
  - `Content-Security-Policy` from `buildStarterCsp(...)`
  - `Content-Security-Policy-Report-Only` when Sentry report URI is available.

### Portal CORS implementation (repo code)
- `src/app/portal/route.ts`:
  - allowlist origins from `TRENDINGREPO_PUBLIC_URL`, `STARSCREENER_PUBLIC_URL`, `NEXT_PUBLIC_SITE_URL`, `PORTAL_CORS_ALLOWED_ORIGINS`.
  - disallowed origin returns `403` with `code: CORS_DENIED`.
  - `Access-Control-Allow-Origin` is only echoed for allowlisted origin.
- `src/app/portal/call/route.ts`:
  - same deny/allowlist behavior for `OPTIONS` + `POST`.

### Env/secret shape
- `.env.example` contains:
  - `PORTAL_CORS_ALLOWED_ORIGINS` (allowlist input)
  - `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` (CSP report-only plumbing)
  - `ADMIN_TOKEN`
  - commented `OPS_ALERT_WEBHOOK`

## Test evidence
- Command:
  - `npx tsx --test src/app/portal/__tests__/cors.route.test.ts src/app/portal/call/__tests__/cors.route.test.ts`
- Result:
  - `pass 4`, `fail 0`.

## Runtime probe evidence (drift check)

### Localhost (expected behavior)
- Command:
  - `curl -i -X OPTIONS http://localhost:3023/portal -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET"`
- Result:
  - `HTTP/1.1 403 Forbidden`
  - No `Access-Control-Allow-Origin` header reflected.

### Production (unexpected behavior)
- Command:
  - `curl -i -X OPTIONS https://trendingrepo.com/portal -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET"`
- Result:
  - `HTTP/1.1 204 No Content`
  - `Access-Control-Allow-Origin: *`

### Admin route spot-check (production)
- Command:
  - `curl -i -X OPTIONS https://trendingrepo.com/api/admin/pool-state -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET"`
- Result:
  - `HTTP/1.1 204 No Content`
  - No `Access-Control-Allow-Origin` header observed.

## Security verdict
- Repo code posture for `/portal` and `/portal/call` is currently deny-by-default for disallowed origins and allowlist-based for approved origins.
- Live production behavior for `/portal` currently does **not** match repo code/test posture (`ACAO: *` returned on OPTIONS), indicating deployment/runtime drift that weakens CORS policy on that surface.

## Required follow-up
1. Platform deploy owner: verify production commit and route artifact for `/portal` OPTIONS handling.
2. After deploy sync: rerun the production probe to confirm disallowed origins return `403` (or at minimum no wildcard ACAO).
3. Keep AGN-1509 blocked until production probe matches repo posture.
