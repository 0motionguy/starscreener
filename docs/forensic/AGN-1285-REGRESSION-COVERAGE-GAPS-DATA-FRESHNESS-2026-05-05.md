# AGN-1285 Regression coverage gaps for data freshness paths (2026-05-05)

## Mandatory opening + preflight
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran: `npm run freshness:check`
- Result: `GET http://localhost:3023/api/health?soft=1 failed: HTTP 500 Internal Server Error`.
- Classification: localhost `3023` is reachable (not missing), product path is stale/degraded.

## Regression coverage evidence (freshness paths)
- `npx tsx --test src/lib/pipeline/__tests__/freshness-endpoint.test.ts` -> PASS (6/6).
- `npx tsx --test src/lib/pipeline/__tests__/freshness-state-route.test.ts` -> PASS (1/1).
- `npx tsx --test src/app/api/cron/freshness/state/__tests__/health-states.test.ts` -> PASS (10/10).

## Coverage gap verdict
1. Existing tests cover freshness snapshot logic and `/api/cron/freshness/state` discriminator behavior, but not a direct route-level regression test for `src/app/api/health/route.ts` soft-health path (`/api/health?soft=1`) when refresh tasks fail.
2. The currently failing preflight endpoint is exactly `/api/health?soft=1`; this failure mode reproduced despite freshness-state tests being green.
3. Residual risk is explicit: regressions in health-route composition/refresh/error fallback can bypass current freshness-state test coverage and surface as release-blocking 500s.

## QA disposition for AGN-1285
- Acceptance status: RED (not met).
- Blocked on: platform/backend owner to add route-level regression tests for `/api/health?soft=1` failure/fallback paths and restore endpoint to non-500 behavior.
- Needs: one focused test suite that fails against the current regression signature and passes after fix, plus fresh `npm run freshness:check` evidence showing health endpoint no longer 500.
