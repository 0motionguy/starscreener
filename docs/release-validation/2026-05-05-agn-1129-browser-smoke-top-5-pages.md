# AGN-1129 Release QA Evidence - Browser smoke top-5 pages with console/request errors

Issue: `AGN-1129`  
Scope: release QA smoke on top-5 release-tier pages with explicit console/request error capture.

## Mandatory opening + freshness preflight
- Mandatory opening bundle completed in this heartbeat: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Command: `npm run freshness:check`
- Checked at: `2026-05-04T20:24:56.537Z`
- Localhost status: `http://localhost:3023` reachable (not missing)
- Freshness verdict: `health=stale sourceStatus=ok`
- Summary: `green=40 yellow=9 red=1 dead=0 blocking_non_green=8 advisory_non_green=2`
- Blocking non-green rows include: `trending-repos=RED`, `twitter=YELLOW`, `producthunt=YELLOW`, `npm=YELLOW`, `lobsters=YELLOW`, `awesome-skills=YELLOW`, `claude-rss=YELLOW`, `openai-rss=YELLOW`
- Sentry row: `MISSING`

## Browser smoke execution (top-5 release-tier pages)
Definition used for top-5: first five routes in `docs/regression-map.md` Release Smoke Tier.

- Base URL: `http://localhost:3023`
- Browser: Playwright Chromium (headless)
- Viewport: `1366x768`
- Checked at: `2026-05-04T20:26:37.738Z`
- Capture fields: HTTP status, body chars, console error count, request failure count

| Route | HTTP | Body chars | Console errors | Request failures | First observed failure |
|---|---:|---:|---:|---:|---|
| `/` | 500 | 725845 | 1 | 1 | `500 Internal Server Error` + external icon `ERR_BLOCKED_BY_ORB` |
| `/consensus` | 500 | 2228705 | 1 | 7 | `500 Internal Server Error` + repeated aborted `/api/pipeline/sidebar-data` |
| `/skills` | 500 | 312038 | 1 | 2 | `500 Internal Server Error` + aborted `/api/pipeline/sidebar-data` |
| `/mcp` | 500 | 257816 | 5 | 5 | `500 Internal Server Error` + repeated `404` resources + external `ERR_BLOCKED_BY_ORB` |
| `/agent-repos` | 500 | 249749 | 1 | 3 | `500 Internal Server Error` + aborted `/api/pipeline/sidebar-data` |

## QA classification
- Environment blocker: `NO` (localhost is reachable; probe executed successfully)
- Product failure: `YES` (all 5/5 pages returned HTTP 500 during smoke)

## Acceptance decision for AGN-1129
- Top-5 browser smoke evidence delivered: `GREEN`
- Top-5 browser smoke acceptance: `RED`
- Release recommendation: `BLOCKED`

## Residual risk
- HTTP 500 across all sampled release-tier pages indicates broad runtime instability; route-level UI checks are not trustworthy until backend/render failures are cleared.
- Freshness preflight was already non-green (`blocking_non_green=8`), so even post-500 fixes require a same-heartbeat recheck before release sign-off.
