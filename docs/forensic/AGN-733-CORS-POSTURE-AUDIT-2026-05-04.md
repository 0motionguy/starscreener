# AGN-733 CORS posture audit (2026-05-04)

## Mandatory opening + freshness
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran `npm run freshness:check` at heartbeat start.
- Result: `localhost:3023` reachable (not missing), but stale/degraded (`GET /api/health?soft=1 -> HTTP 500`).

## Scope and method
- Scope: public-facing API handlers under `src/app/api/**` excluding `admin`, `cron`, `internal`, `pipeline`, `worker`, and `webhooks`.
- Static verification:
  - `rg --files src/app/api`
  - `rg -n "Access-Control-Allow|CORS|OPTIONS|origin|Origin|cors" src/app/api src/lib`
  - direct route-file inspection on all public handlers.
- Runtime verification (localhost):
  - `curl -i -X OPTIONS http://localhost:3023/api/repos -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET"`
  - `curl -i -X OPTIONS http://localhost:3023/api/stream -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET"`

## Findings

### 1) Global CORS posture = implicit deny for `/api/*` routes
- No `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, or `Access-Control-Allow-Headers` found in audited public `/api/*` routes.
- No global CORS injection in `next.config.ts` headers or `middleware.ts`.
- Runtime preflight probes (`OPTIONS` with cross-origin headers) do not return CORS allow headers.

Security interpretation:
- Browser cross-origin JS reads are blocked by default SOP/CORS for `/api/*`.
- Exception outside `/api/*`: portal routes (`/portal`, `/portal/call`) intentionally implement allow-list CORS via `PORTAL_CORS_ALLOWED_ORIGINS` and related site URL envs.

### 2) OPTIONS handling is not explicit on public routes
- Public route handlers do not export `OPTIONS` methods.
- Runtime `OPTIONS` probes returned 400 in current degraded local build path and still emitted no CORS allow headers.

Security interpretation:
- Effective cross-origin denial remains in place.
- Behavior is framework/default-driven rather than explicitly codified per route.

### 3) Abuse surface not solved by CORS: cross-site write initiation on unauth POST endpoints
CORS prevents response reads, not request sending. Routes accepting unauthenticated POST can still be triggered cross-site from a browser context unless origin/CSRF checks exist.

Public write-capable routes observed:
- `/api/checkout/stripe/route.ts` (`POST`)
- `/api/compare/share/route.ts` (`POST`)
- `/api/ideas/route.ts` (`POST`)
- `/api/reactions/route.ts` (`POST`)
- `/api/submissions/revenue/route.ts` (`POST`)
- `/api/tier-lists/route.ts` (`POST`)

Risk class:
- Platform abuse/spam amplification risk (medium), especially for submission/queue-backed routes.

## Per-route inventory (public scope)
All entries below: `CORS headers = none` and `explicit OPTIONS = no`.

- `/api/agent-commerce/[slug]/route.ts`
- `/api/agent-commerce/categories/route.ts`
- `/api/agent-commerce/route.ts`
- `/api/agent-commerce/signals/route.ts`
- `/api/agent-commerce/trending/route.ts`
- `/api/auth/session/route.ts`
- `/api/categories/route.ts`
- `/api/checkout/stripe/route.ts`
- `/api/collections/[slug]/route.ts`
- `/api/collections/route.ts`
- `/api/compare/github/route.ts`
- `/api/compare/payloads/route.ts`
- `/api/compare/route.ts`
- `/api/compare/share/route.ts`
- `/api/export/csv/route.ts`
- `/api/funding/events/route.ts`
- `/api/funding/sectors/route.ts`
- `/api/health/cron-activity/route.ts`
- `/api/health/portal/route.ts`
- `/api/health/route.ts`
- `/api/health/sources/route.ts`
- `/api/ideas/[id]/route.ts`
- `/api/ideas/route.ts`
- `/api/mcp/record-call/route.ts`
- `/api/mcp/usage/route.ts`
- `/api/model-usage/[modelId]/route.ts`
- `/api/model-usage/features/route.ts`
- `/api/model-usage/models/route.ts`
- `/api/model-usage/overview/route.ts`
- `/api/model-usage/rankings/route.ts`
- `/api/oembed/route.ts`
- `/api/og/mindshare/route.tsx`
- `/api/og/star-activity/route.tsx`
- `/api/og/tier-list/route.tsx`
- `/api/og/top10/route.tsx`
- `/api/openapi.json/route.ts`
- `/api/predict/calibration/route.ts`
- `/api/predict/route.ts`
- `/api/profile/[handle]/route.ts`
- `/api/reactions/route.ts`
- `/api/repos/[owner]/[name]/aiso/route.ts`
- `/api/repos/[owner]/[name]/events/route.ts`
- `/api/repos/[owner]/[name]/freshness/route.ts`
- `/api/repos/[owner]/[name]/mentions/route.ts`
- `/api/repos/[owner]/[name]/route.ts`
- `/api/repos/route.ts`
- `/api/repo-submissions/route.ts`
- `/api/scoring/consensus/route.ts`
- `/api/scoring/engagement/route.ts`
- `/api/search/route.ts`
- `/api/skills/route.ts`
- `/api/stream/route.ts`
- `/api/submissions/revenue/route.ts`
- `/api/tier-lists/[shortId]/route.ts`
- `/api/tier-lists/route.ts`
- `/api/tier-lists/templates/[slug]/route.ts`
- `/api/tools/revenue-estimate/route.ts`
- `/api/twitter/leaderboard/route.ts`
- `/api/twitter/repos/[owner]/[name]/route.ts`
- `/api/watchlist/private/route.ts`

## Decision for AGN-733
- CORS allowlist exposure: **no critical misconfiguration found** (default deny posture on `/api/*`, explicit allow-list posture on `/portal*`).
- Gap requiring follow-up: **explicit origin/CSRF-style guardrails for unauthenticated POST endpoints** (platform abuse control, not classic CORS read exposure).

## Recommended follow-up issue
- Create/continue implementation issue under GAP-AUDIT-03 track to enforce origin policy on unauthenticated write routes and add explicit reject telemetry tags (`source`, `category`) via `src/lib/errors.ts` + Sentry.
