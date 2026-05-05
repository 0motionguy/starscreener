# AGN-1533 CORS posture refresh for public APIs (2026-05-05)

## Scope
- Issue: `AGN-1533` (`[Sprint 1 audit] Platform Security CORS posture refresh for public APIs`)
- Public API audit focus: `/api/*` preflight behavior and over-broad origin exposure.

## Mandatory opener + freshness
- Mandatory docs re-opened in this heartbeat.
- `npm run freshness:check` result: request timed out contacting `http://localhost:3023`.
- Verdict: localhost is stale/unreachable from this runner.

## Live production probes (2026-05-05)
Commands:
- `curl -i -X OPTIONS https://trendingrepo.com/api/repos -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET"`
- `curl -i -X OPTIONS https://trendingrepo.com/api/stream -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET"`
- `curl -i -X OPTIONS https://trendingrepo.com/portal -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET"`

Observed:
- `/api/repos`: `204` with no `Access-Control-Allow-Origin` (default deny posture).
- `/api/stream`: `204` with no `Access-Control-Allow-Origin` (default deny posture).
- `/portal`: `204` with `Access-Control-Allow-Origin: *` (over-broad wildcard).

## Repo hardening already applied in this issue
Added `enforceMutationSameOrigin` to these POST routes:
- `src/app/api/auth/session/route.ts`
- `src/app/api/export/csv/route.ts`
- `src/app/api/repo-submissions/route.ts`
- `src/app/api/repos/[owner]/[name]/aiso/route.ts`

## Findings vs acceptance goals
- Sampled public routes and captured CORS methods/headers: complete.
- Flagged over-broad origin risk: `/portal` wildcard ACAO remains present in production.
- Compared live behavior to documented/repo posture: mismatch persists on `/portal`.
- Patch-safe tightening recommendation: keep `/api/*` default deny posture; for `/portal`, enforce explicit allow-list response only (no wildcard), then verify with repeated OPTIONS probes.

## Chain-of-command escalation (fresh)
- Blocker: production `/portal` runtime still emits wildcard ACAO and diverges from intended allow-list posture.
- Unblock owner: CTO + deploy owner/platform.
- Unblock action: verify deployed artifact/headers path for `/portal` OPTIONS, remove wildcard ACAO behavior, then post fresh curl evidence proving deny/allow-list behavior.

## Retry pass (re-queue, 2026-05-05T03:44Z)
- Board-triggered retry executed.
- `npm run freshness:check` still times out contacting `http://localhost:3023`.
- Production probes unchanged:
  - `/api/repos` preflight: `204`, no ACAO.
  - `/api/stream` preflight: `204`, no ACAO.
  - `/portal` preflight: `204`, `Access-Control-Allow-Origin: *` still present.
- Conclusion: blocker remains external to this issue's in-repo patch surface.
