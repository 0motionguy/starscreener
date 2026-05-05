# AGN-312 — SRE Sentry readiness verification packet (Release SRE)

Timestamp (Asia/Makassar): 2026-05-04T19:15:00+08:00

## Scope and method
- Mandatory opening bundle completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- Ran required preflight `npm run freshness:check`.
- Collected live operations evidence for owned surfaces: `.github/workflows/**`, Vercel CLI state, Railway health, and deploy-sensitive `next.config.ts` Sentry wiring.

## Required freshness verdict (this heartbeat)
`npm run freshness:check` at `2026-05-04T11:14:32.167Z` returned:
- localhost:3023 state: reachable (`health=ok`) -> **localhost is not missing**
- product freshness state: `sourceStatus=degraded`
- summary: `green=45 yellow=0 red=0 dead=5 blocking_non_green=4 advisory_non_green=1`
- blocking non-green rows: `category-metrics` DEAD, `mcp-downloads` DEAD, `star-snapshots` DEAD, `trending-repos` DEAD
- readiness row: `Sentry: MISSING`

Classification for release SRE: **stale/degraded product state, not localhost-down**.

## Sentry readiness evidence
1. Sprint forensic baseline confirms operational blocker persists
- `docs/forensic/06-SENTRY-VERIFICATION.md` states Vercel production Sentry is missing and canary is blocked pending DSN.

2. Deploy-sensitive config is wired but env-gated
- `next.config.ts` wraps production builds with `withSentryConfig(...)` and expects:
  - build-time env: `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`
  - runtime readiness path: `SENTRY_DSN` (checked by freshness/sentry verification docs)
- Result: code path exists; operational readiness still depends on missing production env.

3. Vercel auth/context currently blocks direct env verification in this shell
- `vercel env ls production` -> `You specified VERCEL_PROJECT_ID but you forgot to specify VERCEL_ORG_ID`.
- This prevents live Vercel env inspection or canary closure evidence from this heartbeat.

## Cron/workflow state (live)
`gh run list --limit 20 --json workflowName,status,conclusion,createdAt,displayTitle` at this heartbeat shows:
- Recent failures: `CI`, `Collect Twitter Signals`, `Refresh fast discovery`, `Refresh repo profiles`, `Refresh Lobsters signals`, `Source health watch`, `Sync TrustMRR revenue overlays`, `Refresh Bluesky signals`, `Cron - pipeline ingest`, `Refresh OpenAI news`.
- Recent success: `Uptime monitor (every 5 minutes)`, `Cron - webhooks flush + scan`, `Cron - freshness check`, `Cron - weekly digest email`.

Interpretation: cron/workflow lane is active but not healthy enough for release confidence.

## Railway/Redis operational evidence
- `railway status`: project `starscreener`, environment `production`, service `trendingrepo-worker`.
- `https://trendingrepo-worker-production.up.railway.app/healthz` returned:
  - `ok=true`, `db=true`, `redis=true`, `lastRunAt=2026-05-04T11:13:00.007Z`

Interpretation: Railway worker and Redis connectivity are healthy; freshness blockers are not caused by worker hard-down.

## Rollback readiness
- No deploy/env/workflow mutations were performed in this heartbeat.
- Rollback path remains unchanged: use Vercel previous deployment rollback for web runtime and keep Railway service at current healthy deployment until explicit change approval.

## Release SRE decision
- **Do not certify Sentry readiness closure for AGN-312 in this heartbeat.**
- Blocking reasons:
  1. Vercel Sentry readiness remains unresolved (`Sentry: MISSING`).
  2. Product freshness has blocking DEAD rows (`blocking_non_green=4`).
  3. Vercel org auth context missing in operator shell prevents direct production env verification.

## Unblock owner + action
- Blocked on: missing Vercel org context and production Sentry DSN proof path.
- Needs:
  - CTO/Platform Ops: provide `VERCEL_ORG_ID` (or `vercel link` with correct team/project) and set/confirm production `SENTRY_DSN`.
  - Platform engineer: clear blocking freshness DEAD rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`) so freshness gate can pass.

## Resume heartbeat update (2026-05-04T23:32:30+08:00)

Follow-up live checks from resumed heartbeat:

1. Local freshness preflight regressed from prior stale/degraded state to timeout
- `npm run freshness:check` -> `request timed out while contacting http://localhost:3023`.
- Classification for this heartbeat: localhost reachability is currently degraded/unreliable (timeout), so freshness gate cannot be considered passed.

2. Vercel environment verification is still blocked in operator shell
- `vercel env ls production` still fails with missing org context:
  - `You specified VERCEL_PROJECT_ID but you forgot to specify VERCEL_ORG_ID`.

3. Local env presence (boolean only, no secret leakage)
- `SENTRY_DSN=false`
- `NEXT_PUBLIC_SENTRY_DSN=false`
- `SENTRY_AUTH_TOKEN=false`
- `SENTRY_ORG=false`
- `SENTRY_PROJECT=false`
- `CRON_SECRET=true`
- `VERCEL_ORG_ID=false`

4. Canary route reachability and auth behavior
- Unauthenticated request:
  - `GET https://trendingrepo.com/api/_internal/sentry-canary` -> `401 Unauthorized`, body `{"ok":false,"reason":"unauthorized"}`.
- Authenticated request with local `CRON_SECRET`:
  - `GET ...` with `Authorization: Bearer <CRON_SECRET>` -> `404 Not Found`, body `{"ok":false,"error":"not found","code":"NOT_FOUND"}`.

Interpretation:
- Route is reachable and auth-gated (401 proves auth requirement).
- Authenticated `404` indicates canary remains disabled/not exposed in current production runtime path (expected when canary gate/env is off, or deploy/env drift exists).
- Combined with missing Vercel org context + absent local Sentry envs, Sentry production readiness is still not verifiable/closed.
