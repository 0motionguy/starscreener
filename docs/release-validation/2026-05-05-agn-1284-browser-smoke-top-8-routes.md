# AGN-1284 Release QA Evidence - Browser smoke top-8 route reliability pass

Date: 2026-05-05
Owner lane: Release QA
Scope: top-8 release-tier routes on local release target (`http://localhost:3023`).

## Mandatory preflight
- Opening protocol docs read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check`: localhost reachable (not missing) but stale/degraded: `GET /api/cron/freshness/state -> HTTP 500 Internal Server Error`.

## Browser smoke execution
- Timestamp (UTC): 2026-05-04T21:48:06.354Z
- Tool: Playwright Chromium (headless)
- Base URL: `http://localhost:3023`
- Reliability pass set (top-8):
  1. `/`
  2. `/consensus`
  3. `/skills`
  4. `/mcp`
  5. `/agent-repos`
  6. `/breakouts`
  7. `/top`
  8. `/signals`
- Pass criteria per route: HTTP 200 + non-empty rendered body + no navigation error.

## Results matrix
| Route | HTTP | Body chars | Console errors | Request failures | Pass/Fail |
|---|---:|---:|---:|---:|---|
| `/` | 500 | 21 | 1 | 0 | FAIL |
| `/consensus` | 500 | 21 | 1 | 0 | FAIL |
| `/skills` | 500 | 21 | 1 | 0 | FAIL |
| `/mcp` | 500 | 21 | 1 | 0 | FAIL |
| `/agent-repos` | 500 | 21 | 1 | 0 | FAIL |
| `/breakouts` | 500 | 21 | 1 | 0 | FAIL |
| `/top` | 500 | 21 | 1 | 0 | FAIL |
| `/signals` | 500 | 21 | 1 | 0 | FAIL |

Common console error sample:
- `Failed to load resource: the server responded with a status of 500 (Internal Server Error)`

## Acceptance verdict
- Top-8 route reliability pass: `RED`
- Browser-visible verification completed: `YES`
- Failure classification: `PRODUCT FAILURE` (server returns HTTP 500 on all top-8 routes)
- Environment blocker: `NO` (localhost is reachable and browser run executed normally)

## Residual risk
- Local release candidate is not shippable: critical top-tier routes fail at first navigation with HTTP 500.
- Any release evidence that depends on route-level reliability is invalid until platform restores local route health.

## Unblock owner/action
- Unblock owner: Platform engineer
- Required action: restore `http://localhost:3023` top-tier route serving to HTTP 200 and clear freshness endpoint failures, then request QA re-run for AGN-1284.