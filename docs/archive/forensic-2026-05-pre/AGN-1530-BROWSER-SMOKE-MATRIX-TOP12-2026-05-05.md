# AGN-1530 Browser smoke matrix for top 12 sidebar routes (2026-05-05)

## Scope
- Issue: `AGN-1530`
- Goal: run browser smoke checks for top 12 sidebar routes and capture visible/runtime anomalies.
- Base URL: `https://trendingrepo.com`
- Browser: Playwright Chromium headless, viewport `1366x768`
- Capture fields per route: HTTP status, title, console-error count, failed-request count.

## Mandatory opening + freshness preflight
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran: `npm run freshness:check`
- Result: `freshness-check: GET http://localhost:3023/api/health?soft=1 failed: HTTP 500 Internal Server Error`.
- Localhost verdict: `NOT MISSING` (reachable), product is `STALE/DEGRADED` for local preflight.

## Matrix (top 12 sidebar routes)
Checked at: `2026-05-05T01:25:24.156Z`

| Route | HTTP | Title | Console errors | Failed requests |
|---|---:|---|---:|---:|
| `/` | 200 | `TrendingRepo — The trend map for open source` | 3 | 2 |
| `/skills` | 200 | `Trending Skills - TrendingRepo — TrendingRepo` | 3 | 2 |
| `/mcp` | 200 | `Trending MCP - TrendingRepo — TrendingRepo` | 7 | 8 |
| `/agent-repos` | 200 | `Agent Repos — TrendingRepo — TrendingRepo` | 3 | 3 |
| `/breakouts` | 200 | `Cross-Signal Breakouts — TrendingRepo` | 3 | 3 |
| `/consensus` | 200 | `Trending Consensus — TrendingRepo` | 3 | 1 |
| `/signals` | 200 | `Signals — Cross-Source Newsroom — TrendingRepo` | 3 | 6 |
| `/hackernews/trending` | 200 | `Trending on Hacker News — TrendingRepo` | 3 | 4 |
| `/lobsters` | 200 | `TrendingRepo — Lobsters Trending — TrendingRepo` | 3 | 6 |
| `/devto` | 200 | `Trending on Dev.to — TrendingRepo` | 3 | 18 |
| `/bluesky/trending` | 200 | `Trending on Bluesky — TrendingRepo` | 3 | 4 |
| `/reddit/trending` | 200 | `Trending on Reddit — TrendingRepo` | 3 | 2 |

Raw artifact: `docs/forensic/assets/agn-1530/matrix.json`

## QA findings
- `PASS`: all 12 target routes returned HTTP 200 and rendered titles/body in browser smoke.
- `RISK`: repeated failed requests and console errors across all routes (common 404/401 noise and aborted RSC/sidebar-data fetches).
- `P1 regression candidate`: `/mcp` still has the highest failure/error volume (`consoleErrorCount=7`, `failedRequestCount=8`) with external avatar/icon request failures (`ERR_BLOCKED_BY_ORB`) and repeated `404` console errors.
- `P1 regression candidate`: `/devto` has high request-failure volume (`failedRequestCount=18`) dominated by aborted in-app route requests.

## Acceptance decision for AGN-1530
- Binary smoke criterion (top 12 reachable and rendering): `GREEN`.
- Release QA acceptance for noiseless/stable runtime: `RED` due to high persistent request-failure/error noise on primary routes, especially `/mcp` and `/devto`.
- Residual risk: user-visible asset degradation and unstable prefetch/API behavior can mask real regressions and increase false negatives in release smoke.
