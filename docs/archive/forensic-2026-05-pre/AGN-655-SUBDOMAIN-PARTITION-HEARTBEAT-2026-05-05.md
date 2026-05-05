# AGN-655 Subdomain Partitioning Heartbeat (2026-05-05)

Issue: `AGN-655`  
Scope: Release SRE owned surfaces (`next.config.ts`, middleware/deploy routing behavior, workflow/ops evidence)

## Concrete changes made

- Updated `src/middleware.ts` to enforce host partition policy for `static.trendingrepo.com`:
  - allow only:
    - `/brand` (and nested paths)
    - `/api/og/*`
    - `*/opengraph-image*`
    - `*/twitter-image*`
  - redirect all other paths on `static.trendingrepo.com` to `https://trendingrepo.com` with HTTP `308`.
- Expanded middleware matcher to `/:path*` so host policy is actually evaluated for non-API paths.

## Verification evidence

- DNS check:
  - `nslookup static.trendingrepo.com` => `Non-existent domain` (NXDOMAIN).
- OG surface still live on apex:
  - `curl --max-time 8 -D - https://trendingrepo.com/api/og/top10 -o NUL` => `HTTP/1.1 200 OK`.
- Local freshness preflight (earlier in this run):
  - `npm run freshness:check` reached localhost `3023` (not missing) but failed with `/api/cron/freshness/state -> HTTP 500` (stale/degraded).

## Non-blocking repo gate status during this heartbeat

- `npm run typecheck` fails due pre-existing unrelated errors outside AGN-655 scope (e.g. `scripts/scrape-funding-crunchbase.ts`, `src/app/api/pipeline/*`, `src/components/layout/MobileDrawer.tsx`).
- `npm run lint:guards` fails due pre-existing token violations outside AGN-655 scope (e.g. `src/components/layout/CookieConsentBanner.tsx`, `src/components/mindshare/MindshareTreemap.tsx`).

## External blockers (unchanged)

- `static.trendingrepo.com` DNS + Vercel domain attachment not present (NXDOMAIN).
- GitHub CLI auth previously returned `HTTP 401 Bad credentials` for workflow state inspection.
- Paperclip API endpoint (`$PAPERCLIP_API_URL`) unreachable from this session; issue comment/PATCH calls could not be persisted.

## Rollback path

- Change is isolated to middleware host routing logic.
- Rollback: revert `src/middleware.ts` host allowlist block and matcher change, redeploy.

