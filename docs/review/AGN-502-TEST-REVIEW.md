---
status: archive
audit-date: 2026-05-05
reason: code review report of past state; references may not resolve to current files
---

## Test review � Carmela (AGN-502)

**Lenses applied:** Behavior-over-implementation, Failure-mode coverage, Coverage-by-criticality, Test pyramid balance, Determinism

### Findings

**[High] Coverage-by-criticality + Failure-mode coverage � `src/components/admin/DashboardStats.tsx:105` / `src/app/api/health/sources/__tests__/auth-gate.test.ts:17`**
The admin dashboard path is snapshot-only (`fetch` inside a one-shot `useEffect`) and this issue is specifically about missing real-time RPS/error-rate visibility. The only route-level test in this area (`auth-gate.test.ts`) verifies auth envelopes and does not assert any observable behavior for error-rate evolution or refresh cadence.

**Add:**
- `src/components/admin/__tests__/DashboardStats.test.tsx` with fake timers and a mocked `fetch` sequence; assert periodic refresh behavior (poll interval), not just initial render.
- A behavior assertion that stale/error-rate values change on subsequent polls when backend payload changes (proves real-time surface, not static snapshot).

**[High] Failure-mode coverage � `src/app/api/health/sources/route.ts:147` / `src/app/api/health/sources/__tests__/auth-gate.test.ts:36`**
Production contract sets HTTP `207` when any source is `OPEN` or `HALF_OPEN`, which is the key degraded-signal behavior operators need for alerting. Current tests never drive tracker state to OPEN/HALF_OPEN and never assert `207` vs `200`.

**Add:**
- `src/app/api/health/sources/__tests__/status-codes.test.ts` that records failures into `sourceHealthTracker`, calls `GET`, and asserts `status===207` with `summary.open > 0`.
- Companion test for healthy state asserting `status===200` after reset.

**[Medium] Test pyramid balance � `src/app/api/admin/stats/route.ts:151` / `src/lib/__tests__/source-health-tracker.test.ts:61`**
There are solid unit tests for the tracker state machine, but no integration-level test validating that admin/health endpoints expose those state transitions correctly in API payloads. Unit-only coverage here leaves a wiring gap in the critical observability path.

**Add:**
- An endpoint integration test at `src/app/api/health/sources/__tests__/route-behavior.test.ts` that seeds tracker states and asserts payload fields (`summary`, `sources.*.errorRate`, `openedAt`, `nextProbeAt`) match observable contract.

### Tests that look weak but are actually fine

- `src/app/api/health/sources/__tests__/auth-gate.test.ts:29` only checks envelope keys, but that is acceptable for unauthorized responses where payload minimization is the behavior.

---

**Verdict: REQUEST_CHANGES** � this change area lacks tests proving degraded-status signaling and real-time observability behavior for the operator path.
