# AGN-1343 Browser Smoke Matrix for Top 12 Sidebar Routes (2026-05-05)

Issue: `AGN-1343`  
Scope: release QA browser smoke matrix for top 12 sidebar routes.

## Mandatory opening + freshness preflight
- Mandatory opening bundle completed: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Command: `npm run freshness:check`
- Result: failed before freshness evaluation because local environment is missing `tsx` (`'tsx' is not recognized as an internal or external command`).
- Localhost direct probe: `http://localhost:3023/api/health?soft=1` -> `Unable to connect to the remote server`.
- Localhost status verdict: `MISSING` (runtime unavailable in this heartbeat).

## Browser smoke execution (production fallback)
- Base URL: `https://trendingrepo.com`
- Browser: Playwright Chromium headless, viewport `1366x768`
- Checked at: `2026-05-04T22:21:56.225Z`
- Capture: HTTP status, title, body chars, console error count, request failure count

| Route | HTTP | Body chars | Console errors | Request failures | First observed failure |
|---|---:|---:|---:|---:|---|
| `/` | 200 | 10376 | 0 | 2 | `api.smithery.ai/.../icon ERR_BLOCKED_BY_ORB` |
| `/skills` | 200 | 121875 | 0 | 0 | none |
| `/mcp` | 200 | 31003 | 4 | 4 | `404 resource` + `github.com/*.png ERR_BLOCKED_BY_ORB` |
| `/agent-repos` | 200 | 4664 | 0 | 2 | aborted `/api/pipeline/sidebar-data` |
| `/breakouts` | 200 | 1548 | 0 | 3 | aborted `/api/pipeline/sidebar-data` |
| `/consensus` | 200 | 16930 | 0 | 1 | aborted `/api/pipeline/sidebar-data` |
| `/signals` | 200 | 13725 | 0 | 1 | aborted RSC request |
| `/hackernews/trending` | 200 | 4804 | 0 | 3 | aborted `/api/pipeline/sidebar-data` |
| `/lobsters` | 200 | 4983 | 0 | 2 | aborted RSC request |
| `/devto` | 200 | 7221 | 0 | 7 | aborted RSC request |
| `/bluesky/trending` | 200 | 9728 | 0 | 0 | none |
| `/reddit/trending` | 200 | 7592 | 0 | 1 | aborted RSC request |

## QA classification
- Environment blocker (local release preflight): `YES` (`tsx` missing and localhost unavailable)
- Product failure (production surface): `YES` (`/mcp` console 404 errors and frequent aborted sidebar-data/RSC requests across routes)

## Acceptance decision for AGN-1343
- Top-12 sidebar route smoke matrix delivered: `GREEN`
- Acceptance status: `RED`
- Release recommendation: `BLOCKED` until local preflight tooling/runtime is restored and repeated request-failure noise on sidebar routes is reduced/triaged.

## Residual risk
- Without a healthy localhost preflight, regressions can be masked until production verification.
- `/mcp` has route-level console errors; multiple routes show aborted sidebar-data/RSC requests that can hide data hydration issues.
