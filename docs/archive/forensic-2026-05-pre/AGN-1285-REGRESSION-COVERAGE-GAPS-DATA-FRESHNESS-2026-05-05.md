# AGN-1285 Regression coverage gaps for data freshness paths (2026-05-05)

## Mandatory opening + preflight
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran: `npm run freshness:check`
- Prior result (run `c8c18f00-f4ee-4510-afb0-283fe3893c97`): `GET http://localhost:3023/api/health?soft=1 failed: HTTP 500 Internal Server Error`.
- Current result (reopen heartbeat): `local server not reachable at http://localhost:3023 ... (code=ECONNREFUSED)`.
- Classification:
  - Product-path regression signature was observed (`/api/health?soft=1` HTTP 500 with localhost reachable).
  - Current heartbeat is environment/runtime unavailable (localhost missing), so no new product verdict can be taken until local server is up.

## Regression coverage evidence (freshness paths)
- `npx tsx --test src/lib/pipeline/__tests__/freshness-endpoint.test.ts` -> PASS (6/6).
- `npx tsx --test src/lib/pipeline/__tests__/freshness-state-route.test.ts` -> PASS (1/1).
- `npx tsx --test src/app/api/cron/freshness/state/__tests__/health-states.test.ts` -> PASS (10/10).

## Existing test inventory (acceptance 1)
- `src/lib/pipeline/__tests__/freshness-endpoint.test.ts`
  - Covers freshness snapshot invariants and `/api/repos/[owner]/[name]/freshness` validation/404 behavior.
- `src/lib/pipeline/__tests__/freshness-state-route.test.ts`
  - Covers expanded source inventory and advisory `blocking=false` flags on `/api/cron/freshness/state`.
- `src/app/api/cron/freshness/state/__tests__/health-states.test.ts`
  - Covers `deriveHealth` status discriminator (`ok` / `advisory` / `stale`) against blocking/non-blocking mixes.

## Missing critical-path scenarios (acceptance 2)
1. No direct tests for `src/app/api/health/route.ts` soft path (`/api/health?soft=1`) when one or more refresh dependencies reject or timeout.
2. No direct test ensuring unauthorized soft callers get a sanitized 503 error envelope (without sensitive per-source details) when route-level exception occurs.
3. No direct test for `softRefreshInFlight` coalescing and soft-cache reuse behavior under concurrent soft requests.
4. No direct test that `/api/health?soft=1` remains non-500 when dependent data-store reads are degraded but fallback body is expected.

## Proposed test cases with owner (acceptance 3)
1. Owner: platform/backend engineer.
   - Add route-level unit/integration test for `GET /api/health?soft=1` where one refresh helper throws; assert response status/body follow documented fallback contract (no uncaught 500 path leak for soft probe).
2. Owner: platform/backend engineer.
   - Add auth-surface test for unauthenticated `soft=1` failure path; assert stripped public body fields only.
3. Owner: platform/backend engineer.
   - Add concurrency test for two simultaneous `soft=1` requests; assert a single coalesced refresh run and stable response.
4. Owner: release QA engineer.
   - Add regression harness assertion that `npm run freshness:check` classifies `ECONNREFUSED` as environment blocker and `HTTP 500` as product-path failure, with explicit evidence wording.

## Risk statement for untested paths (acceptance 4)
- Current freshness tests can all pass while release preflight still fails on `/api/health?soft=1`.
- Until health-route soft-path tests exist, regressions in refresh orchestration/fallback behavior can escape CI and appear only at release gate time.
- Impact: false confidence from green freshness-state tests, delayed diagnosis, and repeated stale/degraded release loops.

## QA disposition for AGN-1285
- Acceptance status: GREEN for audit deliverable (inventory, gaps, proposed owners, risk statement documented).
- Follow-up implementation is tracked as platform/backend execution work; AGN-1285 itself is a QA audit packet, not the fix ticket.
