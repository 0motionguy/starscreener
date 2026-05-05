---
status: archive
audit-date: 2026-05-05
reason: dated release-validation heartbeat artifact
---

# AGN-215 Critical Path E2E Spec Ownership + Unblock Map (2026-05-04)

## Scope and evidence anchor
- Spec under ownership: `tests/e2e/critical-paths.spec.ts`
- Mandatory preflight evidence:
  - `npm run freshness:check`
  - Result at `2026-05-04` heartbeat: `freshness-check: local server not reachable at http://localhost:3023 (ECONNREFUSED)`

## Critical path spec inventory

| Spec node | Route | Readiness contract | Primary owner | Secondary owner |
|---|---|---|---|---|
| `home renders` | `/` | HTTP 200 + title + `.home-surface` visible | Frontend engineer | Platform engineer |
| `signals renders` | `/signals` | HTTP 200 + title + `[data-surface='signals-primary-feeds']` visible | Frontend engineer | Data pipeline engineer |
| `repo-detail renders` | `/repo/vercel/next.js` | HTTP 200 + title + `[data-repo-id-strip='1']` visible | Backend engineer | Data pipeline engineer |
| `compare renders` | `/compare?...` | HTTP 200 + title + `.page-head` visible | Backend engineer | Frontend engineer |

## Unblock matrix (critical path execution)

| Blocker | Impact on AGN-215 | Owner | Unblock action | Done when |
|---|---|---|---|---|
| `localhost:3023` down (`ECONNREFUSED`) | Playwright critical-path suite cannot run in this workspace | Platform engineer | Start local app (`npm run dev`) and keep `/api/health?soft=1` reachable | `npm run freshness:check` exits 0 and reports no blocking non-green rows |
| Freshness route instability (`/api/cron/freshness/state` historical 500 in sprint log) | Can cause preflight failure before e2e gate | Backend engineer | Keep route contract stable and fail-soft envelope typed | Direct GET to local freshness state returns HTTP 200 across consecutive checks |
| Selector drift in page contracts | False negatives in e2e on healthy routes | Frontend engineer | Keep stable `data-*` selectors for critical surfaces | `tests/e2e/critical-paths.spec.ts` passes without locator edits |
| Data freshness drift (route returns 200 with stale internals) | E2E pass may hide stale product state | Data pipeline engineer | Maintain source freshness budgets for route dependencies | `/api/health` and `/api/pipeline/status` remain non-degraded for production checks |

## Backend-owned contract checks for this issue
1. Keep `/api/health?soft=1` and `/api/cron/freshness/state` as hard prerequisites for e2e launch readiness.
2. Keep API-side failures in typed envelopes (`src/lib/errors.ts` + route error response path) so e2e failures are diagnosable.
3. Do not run critical-path e2e when preflight is red due to localhost reachability.

## Heartbeat outcome
- AGN-215 produced ownership and unblock map artifact.
- Execution remains blocked for local critical-path run until platform restores localhost preflight (`localhost:3023`).
