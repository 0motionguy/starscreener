# AGN-1533 CORS posture refresh for public APIs (2026-05-05)

## Scope
- Issue: `AGN-1533` (`[Sprint 1 audit] Platform Security CORS posture refresh for public APIs`)
- Owner lane: Platform Security
- Surfaces touched (public API mutation guard hardening):
  - `src/app/api/auth/session/route.ts`
  - `src/app/api/export/csv/route.ts`
  - `src/app/api/repo-submissions/route.ts`
  - `src/app/api/repos/[owner]/[name]/aiso/route.ts`

## Mandatory opening + freshness gate
- Opened required docs in order: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran `npm run freshness:check` on `2026-05-05`:
  - Result: `freshness-check: local server not reachable at http://localhost:3023 ... (ECONNREFUSED)`
  - Verdict: localhost missing; product stale/unreachable for local runtime probes.

## Runtime verification (production)
Commands:
- `curl -i -X OPTIONS https://trendingrepo.com/api/repos -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET"`
- `curl -i -X OPTIONS https://trendingrepo.com/api/stream -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET"`
- `curl -i -X OPTIONS https://trendingrepo.com/portal -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET"`

Observed:
- `/api/repos`: `204`, no `Access-Control-Allow-Origin` header (default deny posture).
- `/api/stream`: `204`, no `Access-Control-Allow-Origin` header (default deny posture).
- `/portal`: `204` with `Access-Control-Allow-Origin: *` (runtime drift vs repo allow-list posture from AGN-1509 evidence).

## Security hardening applied (this heartbeat)
Added explicit same-origin mutation denial (`enforceMutationSameOrigin`) to public POST handlers that are abuse-relevant or cookie-auth sensitive:

1. `src/app/api/auth/session/route.ts`
   - `POST /api/auth/session` now rejects cross-origin mutation with 403 `ORIGIN_DENIED` before issuing/rotating session cookie.

2. `src/app/api/export/csv/route.ts`
   - `POST /api/export/csv` now rejects cross-origin mutation with 403 `ORIGIN_DENIED` before auth/entitlement + export work.

3. `src/app/api/repo-submissions/route.ts`
   - `POST /api/repo-submissions` now rejects cross-origin mutation with 403 `ORIGIN_DENIED` before rate-limit and Turnstile flow.

4. `src/app/api/repos/[owner]/[name]/aiso/route.ts`
   - `POST /api/repos/[owner]/[name]/aiso` now rejects cross-origin mutation with 403 `ORIGIN_DENIED` before queue write/rate-limit path.

## Verification commands after patch
- `npm run typecheck` -> **FAIL (pre-existing unrelated workspace errors)**
  - Includes existing failures in `src/app/api/webhooks/stripe/route.ts`, `src/app/arxiv/trending/page.ts`, compare-share tests, and others not touched by this patch.
- `npm run lint:guards` -> **FAIL (pre-existing unrelated guard failures)**
  - `lint:zod-routes` fails on:
    - `src/app/api/cron/github-pool-budget/route.ts`
    - `src/app/api/cron/subdomain-takeover/route.ts`

## Result
- Public `/api/*` CORS deny-by-default posture remains intact.
- Cross-site POST initiation surface has been reduced on four public endpoints by enforcing same-origin checks with explicit 403 denial.
- `/portal` production wildcard CORS drift remains an open deploy/runtime mismatch and should stay tracked separately from this `/api/*` hardening delta.
