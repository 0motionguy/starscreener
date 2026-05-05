# AGN-627 [SPEED-10] Vercel deploy minutes - gzip + brotli compression policy verify

Date: 2026-05-04
Owner: Release SRE

## Scope
- Verify deploy-sensitive compression policy in code.
- Verify live production response encoding behavior.
- Inspect workflow/cron/deploy observability status for release readiness.

## Code-state evidence
- `next.config.ts` contains `compress: true` (line 114).

## Live production evidence (trendingrepo.com)
Test method: `curl` with explicit `Accept-Encoding` variants.

1. `GET /` with `Accept-Encoding: br,gzip`:
- `HTTP/1.1 200 OK`
- `Content-Encoding: br`
- `Transfer-Encoding: chunked`
- `X-Vercel-Id` present

2. `GET /` with `Accept-Encoding: gzip`:
- `HTTP/1.1 200 OK`
- `Content-Encoding: gzip`
- `Transfer-Encoding: chunked`
- `X-Vercel-Id` present

3. Static asset probe (current page chunk):
- URL: `/_next/static/chunks/webpack-07b969fe864154b7.js`
- `HTTP/1.1 200 OK`
- `Content-Encoding: br`
- `Cache-Control: public,max-age=31536000,immutable`

Conclusion: production is negotiating both Brotli and gzip successfully; compression policy is active at edge/runtime.

## Cron/workflow/deploy inspection status
- Cron endpoint probe:
  - `GET https://trendingrepo.com/api/cron/freshness/state`
  - Result: `HTTP/1.1 401 Unauthorized` (route is live and auth-gated).
- GitHub Actions live run inspection:
  - `gh run list ...` failed with `HTTP 401: Bad credentials`.
  - `gh auth status` shows active `GITHUB_TOKEN` invalid.
- Vercel deploy lineage/rollback CLI inspection:
  - `VERCEL_PROJECT_ID` is set.
  - `VERCEL_ORG_ID` is empty.
  - Deploy-list/rollback verification is blocked without org context.

## Freshness opener requirement status
- `npm run freshness:check` result:
  - `request timed out while contacting http://localhost:3023`
- Interpretation: localhost is not confirmed missing, but product is stale/unhealthy for this heartbeat due to timeout.

## Rollback readiness
- Functional rollback path remains the same:
  1. Promote previous healthy Vercel deployment.
  2. Re-run health/freshness checks.
  3. If failure persists post-rollback, classify as data/cron failure (not code deploy regression).
- Blocker: this shell cannot verify deployment lineage/promotion operations until `VERCEL_ORG_ID` is provided.

## Blockers and required unblock actions
1. GitHub Actions visibility blocker:
- Blocked on: invalid active `GITHUB_TOKEN` for `gh run` API.
- Needs: platform/CTO to provide a valid token in environment for this lane.

2. Vercel deploy-state/rollback verification blocker:
- Blocked on: missing `VERCEL_ORG_ID`.
- Needs: platform/CTO to set `VERCEL_ORG_ID` paired with current `VERCEL_PROJECT_ID`.
