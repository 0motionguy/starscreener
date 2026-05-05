# AGN-667 forensic evidence (2026-05-05)

Issue: `AGN-667`  
Scope: Hidden API endpoint enumeration audit (CORS reflection + auth bypass)

## 1) Live production probes

All probes run from this workspace via `curl.exe`.

### Admin/auth gate
- `GET https://trendingrepo.com/api/admin/stats`
- Result: `HTTP/1.1 503 Service Unavailable`
- Interpretation: admin endpoint is not anonymously accessible.

### Hidden endpoint enumeration
- `GET https://trendingrepo.com/api/%5Finternal/sentry-canary -H "Authorization: Bearer invalid"`
- Result: `HTTP/1.1 404 Not Found`
- Interpretation: encoded hidden path is not exposed as a callable endpoint.

### CORS behavior (critical finding)
- `OPTIONS https://trendingrepo.com/portal -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET"`
- Result: `HTTP/1.1 204 No Content` with `Access-Control-Allow-Origin: *`

- `OPTIONS https://trendingrepo.com/portal/call -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST"`
- Result: `HTTP/1.1 204 No Content` with `Access-Control-Allow-Origin: https://evil.example`

Interpretation: production is currently permissive for untrusted origins on Portal surfaces.

## 2) Branch hardening and regression coverage

### OpenAPI hidden-path hardening (already landed in previous heartbeat)
- File: `src/app/api/openapi.json/route.ts`
- Guard: non-public prefixes now blocked after decode normalization (`%61dmin`, `%5Finternal`, `%77ebhooks`, `%63ron`).

### OpenAPI regression test
- File: `src/lib/pipeline/__tests__/openapi-route.test.ts`
- Added assertion for encoded non-public prefix handling.
- Verification: `npx tsx --test src/lib/pipeline/__tests__/openapi-route.test.ts` -> `8/8` pass.

### Portal CORS regression tests (this heartbeat)
- File: `src/app/portal/__tests__/cors.route.test.ts`
- File: `src/app/portal/call/__tests__/cors.route.test.ts`
- Added preflight assertions:
  - disallowed origin -> `403`, no `Access-Control-Allow-Origin`
  - configured origin -> `204`, explicit matching `Access-Control-Allow-Origin`
- Verification:
  - `npx tsx --test src/app/portal/__tests__/cors.route.test.ts src/app/portal/call/__tests__/cors.route.test.ts`
  - Result: `4/4` pass

## 3) CTO verification gate status (workspace baseline)

- `npm run typecheck` -> fails due pre-existing `.next/types` missing-file state.
- `npm run build` -> fails on pre-existing unrelated errors:
  - `src/app/tierlist/page.tsx` (`ssr: false` in Server Component dynamic import)
  - edge bundling path for `src/app/api/oembed/route.ts` via `ioredis`/Node core module resolution

These failures were not introduced by AGN-667 changes.

## 4) Current conclusion

- Auth bypass on checked admin/internal probes: **not reproduced**.
- CORS misconfiguration on production Portal surfaces: **reproduced**.
- Branch has regression tests and hardening for related enumeration/CORS logic.
- Remaining blocker is deployment/runtime parity and baseline CI health for full close gate.
