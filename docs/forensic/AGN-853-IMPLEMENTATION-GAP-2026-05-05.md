# AGN-853 route-cost attribution implementation-gap heartbeat (2026-05-05)

## Summary
This heartbeat switched from triage to implementation verification after AGN-1360 completed.

Verification result: AGN-853 product implementation is not present in current code snapshot.

## Evidence
- Route-cost surface search:
  - `rg -n "admin/costs|costs/page|top-10 cost|route_cost|route-cost|lambda_invocation|invocation_cost" src -S`
  - Result: no matches.
- PostHog server capture exists, but only for GitHub API call telemetry:
  - `src/lib/analytics/posthog.ts`
  - call sites in `src/lib/github-fetch.ts` and `src/lib/pipeline/adapters/github-adapter.ts`
- No `/admin/costs` route or `/api/admin/costs` handler found in `src/app`.

## Durable progress shipped (SRE-owned surfaces)
- Added workflow: `.github/workflows/sre-route-cost-attribution-verify.yml`
  - Schedule: every 6h (`17 */6 * * *`) + manual dispatch.
  - Probes `BASE_URL/admin/costs` and `BASE_URL/api/admin/costs`.
  - Validates HTTP 200 plus basic top-10 route-cost payload markers.
  - Uploads verification artifacts under `.tmp/route-cost`.
  - Fails hard when AGN-853 implementation contract is missing.

## Blocker classification
Blocked on implementation dependency outside Release SRE owned surfaces:
- Missing per-request server capture event for route-level invocation cost inputs.
- Missing `/admin/costs` dashboard surface.
- Missing `/api/admin/costs` aggregate endpoint (or equivalent contract).

## Unblock owner/action
- Backend/frontend owner:
  1. Implement server-side PostHog event capture for each server-rendered request with route identifier.
  2. Implement `/api/admin/costs` contract exposing top-10 cost routes.
  3. Implement `/admin/costs` UI that renders top-10 route costs.
- Release SRE follow-up after merge:
  4. Run `sre-route-cost-attribution-verify.yml` and attach artifact evidence from a passing run.
