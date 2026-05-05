# AGN-1284 Release QA Evidence - Browser smoke top-8 route reliability pass

Date: 2026-05-05
Owner lane: Release QA
Scope: top-8 release-tier routes on local release target (`http://localhost:3023`).

## Preflight + reproducibility
1. Mandatory opening bundle re-read (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
2. `npm run freshness:check` initially timed out contacting localhost.
3. QA forced clean local rerun by restarting dev server (`npm run dev` on port 3023).
4. After restart, `npm run freshness:check` still fails reproducibly with `GET /api/health?soft=1 -> HTTP 500 Internal Server Error`.

## Browser smoke execution (top-8)
- Timestamp (UTC): 2026-05-05T01:03:24.119Z
- Tool: Playwright Chromium (headless)
- Base URL: `http://localhost:3023`
- Route set:
  1. `/`
  2. `/consensus`
  3. `/skills`
  4. `/mcp`
  5. `/agent-repos`
  6. `/breakouts`
  7. `/top`
  8. `/signals`
- Pass criteria: HTTP 200 + rendered body content + no navigation failure.

## Route matrix (status/title/errors)
| Route | HTTP | Title | Body chars | Console errors | Request failures | Verdict |
|---|---:|---|---:|---:|---:|---|
| `/` | 500 | `(empty)` | 21 | 1 | 0 | FAIL |
| `/consensus` | 500 | `(empty)` | 21 | 1 | 0 | FAIL |
| `/skills` | 500 | `(empty)` | 21 | 1 | 0 | FAIL |
| `/mcp` | 500 | `(empty)` | 21 | 1 | 0 | FAIL |
| `/agent-repos` | 500 | `(empty)` | 21 | 1 | 0 | FAIL |
| `/breakouts` | 500 | `(empty)` | 21 | 1 | 0 | FAIL |
| `/top` | 500 | `(empty)` | 21 | 1 | 0 | FAIL |
| `/signals` | 500 | `(empty)` | 0 | 1 | 0 | FAIL |

## Reproducible failure signatures
- Signature A (freshness gate): `freshness-check: GET http://localhost:3023/api/health?soft=1 failed: HTTP 500 Internal Server Error`.
- Signature B (browser): `Failed to load resource: the server responded with a status of 500 (Internal Server Error)` on every route in the top-8 set.
- Signature C (route-level behavior): all top-8 routes return server-side HTTP 500 after clean dev restart.

## Severity ranking
1. `SEV-1` - Route availability failure: 8/8 top-tier release routes fail with HTTP 500.
2. `SEV-1` - Freshness gate hard-fail: `/api/health?soft=1` is 500, blocking release QA pass criteria.
3. `SEV-2` - Local reliability instability: preflight changed from timeout to 500 across reruns, indicating unstable local server behavior around the same failure class.

## Handoff for owner
- Owner: Platform engineer
- Concrete unblock steps:
  1. Start local app: `npm run dev` (port 3023).
  2. Reproduce gate: `npm run freshness:check`.
  3. Reproduce API failure directly: `curl -i http://localhost:3023/api/health?soft=1`.
  4. Inspect local server logs from this QA run: `.tmp/agn-1284-dev.out.log` and `.tmp/agn-1284-dev.err.log`.
  5. Fix root cause until `/api/health?soft=1` returns HTTP 200 and top-8 routes return HTTP 200.
  6. Request QA re-run on AGN-1284.

## Acceptance verdict
- Route matrix with status/title/errors: `GREEN` (captured)
- Reproducible failure signatures: `GREEN` (captured)
- Severity ranking: `GREEN` (captured)
- Handoff issue/owner actionability: `GREEN` (owner + exact commands/paths captured)
- Overall top-8 route reliability pass: `RED` (product not shippable)