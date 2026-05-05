# AGN-1343 Browser smoke matrix for top 12 sidebar routes (2026-05-05)

## Scope
- Issue: `AGN-1343`
- Goal: run browser smoke checks for top 12 sidebar routes and capture console/network anomalies.
- Base URL: `https://trendingrepo.com`
- Browser: Playwright Chromium headless, viewport `1366x768`
- Capture fields per route: HTTP status, title, console-error count, failed-request count.

## Mandatory opening + freshness preflight
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran: `npm run freshness:check`
- Result: `freshness-check: local server not reachable at http://localhost:3023 ... ECONNREFUSED`.
- Localhost verdict: `MISSING` (environment blocker for local preflight only).

## Matrix (top 12 sidebar routes)
Checked at: `2026-05-05T00:57:58.995Z`

| Route | HTTP | Title | Console errors | Failed requests |
|---|---:|---|---:|---:|
| `/` | 200 | `TrendingRepo — The trend map for open source` | 3 | 3 |
| `/skills` | 200 | `Trending Skills - TrendingRepo — TrendingRepo` | 3 | 2 |
| `/mcp` | 200 | `Trending MCP - TrendingRepo — TrendingRepo` | 7 | 5 |
| `/agent-repos` | 200 | `Agent Repos — TrendingRepo — TrendingRepo` | 3 | 4 |
| `/breakouts` | 200 | `Cross-Signal Breakouts — TrendingRepo` | 3 | 6 |
| `/consensus` | 200 | `Trending Consensus — TrendingRepo` | 3 | 1 |
| `/signals` | 200 | `Signals — Cross-Source Newsroom — TrendingRepo` | 3 | 4 |
| `/hackernews/trending` | 200 | `Trending on Hacker News — TrendingRepo` | 3 | 3 |
| `/lobsters` | 200 | `TrendingRepo — Lobsters Trending — TrendingRepo` | 3 | 4 |
| `/devto` | 200 | `Trending on Dev.to — TrendingRepo` | 3 | 19 |
| `/bluesky/trending` | 200 | `Trending on Bluesky — TrendingRepo` | 3 | 3 |
| `/reddit/trending` | 200 | `Trending on Reddit — TrendingRepo` | 3 | 3 |

Raw artifact: `docs/forensic/assets/agn-1343/matrix.json`

## P1 anomaly with repro + screenshot

### P1-01: `/mcp` external icon/avatar fetch failures produce repeated console/request errors
- Route: `/mcp`
- Severity: `P1` (user-visible asset degradation + high console noise on a primary sidebar route)
- Evidence:
  - Screenshot: `docs/forensic/assets/agn-1343/mcp-route.png`
  - Failed requests include:
    - `https://github.com/rashforddamion.png?size=80 :: net::ERR_BLOCKED_BY_ORB`
    - `https://github.com/icons8community.png?size=80 :: net::ERR_BLOCKED_BY_ORB`
    - `https://api.smithery.ai/servers/polymarket/polymarket-mcp/icon :: net::ERR_BLOCKED_BY_ORB`
  - Console includes multiple `Failed to load resource: the server responded with a status of 404 ()` entries.

Repro steps:
1. Open Chromium and navigate to `https://trendingrepo.com/mcp`.
2. Open DevTools Console + Network tab.
3. Hard refresh once (`Ctrl+Shift+R`).
4. Observe repeated failed image/icon requests and repeated console `Failed to load resource` messages.

## Child issue filing
- Filed child issue under `AGN-1343` for P1-01 (`/mcp` icon/avatar failure triage + fallback handling).

## QA classification
- Environment blocker: `YES` (localhost preflight unavailable).
- Product anomaly: `YES` (reproducible P1 on `/mcp`).
- Acceptance status for this heartbeat: `RED` (matrix complete, but defect remains open in child issue).
