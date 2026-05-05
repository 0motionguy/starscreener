---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

# CORS Policy

Last updated: 2026-05-05
Owner: Platform Security (`paperclip-sec`)

## Scope
- Applies to HTTP routes in `src/app/api/**` and portal routes under `src/app/portal/**`.
- Policy intent: same-origin by default, explicit allow-list only where cross-origin browser access is required.

## Default posture (all API routes)
- Default is deny-by-omission for cross-origin browser reads:
  - no global `Access-Control-Allow-*` headers in `next.config.ts` or middleware
  - no automatic cross-origin API exposure
- Routes that do not implement explicit CORS headers are same-origin-only for browser JS access.

## Explicit cross-origin routes

### `/portal` (GET, OPTIONS)
- File: `src/app/portal/route.ts`
- CORS behavior:
  - `OPTIONS` supported
  - `Access-Control-Allow-Origin` echoes request origin only if allow-listed
  - `Access-Control-Allow-Methods: GET, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, X-API-Key`
  - `Vary: Origin`
  - disallowed origin -> `403` with `CORS_DENIED`

### `/portal/call` (POST, OPTIONS)
- File: `src/app/portal/call/route.ts`
- CORS behavior:
  - `OPTIONS` supported
  - `Access-Control-Allow-Origin` echoes request origin only if allow-listed
  - `Access-Control-Allow-Methods: POST, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, X-API-Key`
  - `Vary: Origin`
  - disallowed origin -> `403` with `CORS_DENIED`

## Allowed origins source
- Primary envs parsed by portal routes:
  - `TRENDINGREPO_PUBLIC_URL`
  - `STARSCREENER_PUBLIC_URL`
  - `NEXT_PUBLIC_SITE_URL`
  - `PORTAL_CORS_ALLOWED_ORIGINS` (comma-separated)
- Dev fallback origins when `NODE_ENV != production`:
  - `http://localhost:3023`
  - `http://127.0.0.1:3023`

## `PORTAL_CORS_ALLOWED_ORIGINS` status
- Declared in `.env.example` as optional.
- Intended format:
  - `PORTAL_CORS_ALLOWED_ORIGINS=https://trendingrepo.com,https://www.trendingrepo.com`

## Wildcard policy
- `Access-Control-Allow-Origin: *` is prohibited for sensitive/authenticated endpoints.
- Current code audit (2026-05-05): no wildcard ACAO in live route handlers; portal routes use allow-list echo semantics.

## Abuse caveat (non-CORS)
- CORS does not prevent cross-site request sending; it mainly prevents cross-origin response reads in browsers.
- Public write endpoints still require abuse controls (rate-limit, origin/CSRF strategy where applicable, bot controls).
