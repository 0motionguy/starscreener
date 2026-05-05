# AGN-1349 CSP/CORS posture re-verification (2026-05-05)

## Mandatory opening + freshness preflight
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran: `npm run freshness:check`
- Result: `freshness-check: local server not reachable at http://localhost:3023` (`ECONNREFUSED`).
- Classification: localhost:3023 missing, local product stale for on-box verification.

## Code-path verification (repo)

### Global security headers / CSP wiring
- File: `next.config.ts`
- Evidence:
  - `headers()` sets baseline security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`).
  - Production block adds `Strict-Transport-Security` and `Content-Security-Policy` (`Content-Security-Policy-Report-Only` when Sentry DSN report URI is available).

### Portal CORS allowlist logic
- File: `src/app/portal/route.ts`
  - `getAllowedOrigins()` derives origins from `TRENDINGREPO_PUBLIC_URL`, `STARSCREENER_PUBLIC_URL`, `NEXT_PUBLIC_SITE_URL`, `PORTAL_CORS_ALLOWED_ORIGINS` (+ localhost in non-prod).
  - `hasDisallowedOrigin()` returns deny for unapproved origins.
  - `OPTIONS` and `GET` return `403` with `{ code: "CORS_DENIED" }` for disallowed origins.
- File: `src/app/portal/call/route.ts`
  - Same allowlist/deny structure for `POST/OPTIONS`.

### Other public CORS-touched route
- File: `src/app/x402/route.ts`
  - `OPTIONS` returns `Access-Control-Allow-Methods` only; no `Access-Control-Allow-Origin` reflection.

## Live production header verification (trendingrepo.com)

### Public API health endpoint
- Command: `curl -sSI "https://trendingrepo.com/api/health?soft=1"`
- Result: `HTTP/1.1 200 OK`, no `Access-Control-Allow-Origin` header.
- Command: `curl -sSI -H "Origin: https://evil.example" "https://trendingrepo.com/api/health?soft=1"`
- Result: still no `Access-Control-Allow-Origin` header (non-reflective CORS posture).

### `/portal` CORS behavior (live)
- Command: `curl -sSI -X OPTIONS -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET" "https://trendingrepo.com/portal"`
- Result: `HTTP/1.1 204 No Content` with `Access-Control-Allow-Origin: *`.
- Command: `curl -sSI -X OPTIONS -H "Origin: https://trendingrepo.com" -H "Access-Control-Request-Method: GET" "https://trendingrepo.com/portal"`
- Result: `HTTP/1.1 204 No Content` with `Access-Control-Allow-Origin: *`.

### `/portal/call` CORS behavior (live)
- Command: `curl -sSI -X OPTIONS -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST" "https://trendingrepo.com/portal/call"`
- Result: `HTTP/1.1 204 No Content` with `Access-Control-Allow-Origin: https://evil.example` and `Vary: Origin`.

### Public cron endpoint CORS check
- Command: `curl -sSI -X OPTIONS -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET" "https://trendingrepo.com/api/cron/freshness/state"`
- Result: `HTTP/1.1 204 No Content`, `Allow: GET, HEAD, OPTIONS`, no ACAO header.

## Security verdict for AGN-1349
1. Local preflight failed because localhost is missing; only remote verification is authoritative this heartbeat.
2. Most public API surfaces probed are non-reflective for CORS.
3. `portal` and `portal/call` live behavior is currently permissive (`*` or arbitrary origin reflection), which does not match stricter deny-on-disallowed-origin logic in current repo code.
4. This mismatch is a platform-security concern requiring deploy/config reconciliation before considering portal CORS posture hardened.
