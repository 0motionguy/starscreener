# AGN-164 Browser Smoke Failure Taxonomy Update (2026-05-04)

Issue: `AGN-164`  
Scope: Sprint 1 audit QA taxonomy refresh using current browser-smoke evidence from `docs/AUDIT-2026-05-04.md`.

## Evidence basis
- Mandatory preflight: `npm run freshness:check` failed with `ECONNREFUSED` (`localhost:3023` missing).
- Browser smoke source table: `docs/AUDIT-2026-05-04.md` section `Browser render issues observed`.
- Classification rule used in this update:
  - `data`: failures tied to API/data freshness/service availability.
  - `ui`: route/UI resource wiring faults (404s/invalid chunks/missing assets from app surface).
  - `external_asset`: third-party image/media blocking.
  - `transient_network`: request abort/timeouts likely from navigation races or unstable network path.

## Top 15 recurring failures (ranked)

| Rank | Failure signature | Category | Recurrence evidence | Impact |
|---|---|---|---|---|
| 1 | `/devto` `ERR_BLOCKED_BY_ORB` image loads from `dev.to` | external_asset | 31 request failures | High visual degradation on a core signal page |
| 2 | `/bluesky/trending` `404 resource load` | ui | 22 console errors + 27 request failures | Severe route noise, trust drop for signal surface |
| 3 | `/lobsters` `404 resource load` | ui | 16 console errors | Persistent broken resource indicators |
| 4 | `/consensus` aborted RSC request (`/you`) | transient_network | 13 request failures | Incomplete hydration risk on consensus route |
| 5 | `/collections` aborted RSC request (`/categories/ai-agents`) | transient_network | 12 request failures | Collection detail prefetch/hydration instability |
| 6 | `/producthunt` `ERR_BLOCKED_BY_ORB` image loads from `unavatar.io` | external_asset | 8 request failures | Visual identity/media regressions |
| 7 | `/hackernews/trending` `404 resource load` | ui | 8 console errors | Broken static/resource references |
| 8 | `/mcp` aborted `/api/pipeline/sidebar-data` | data | 6 request failures | Sidebar data fetch instability on MCP surface |
| 9 | `/watchlist` aborted RSC request (`/compare`) | transient_network | 6 request failures | Navigation instability across tool surfaces |
| 10 | `/mindshare` aborted repo star-activity RSC request | data | 5 request failures | Signal completeness risk on mindshare analytics |
| 11 | `/skills` `503` resource load | data | 1 console error + 4 request failures | Service/backend unavailability symptom |
| 12 | `/compare` `503` resource load | data | 3 console errors + 3 request failures | Core tool can surface degraded comparisons |
| 13 | `/reddit/trending` aborted `/api/pipeline/sidebar-data` | data | 4 request failures | Shared sidebar data instability propagates |
| 14 | `/agent-repos` aborted RSC request (`/skills`) | transient_network | 4 request failures | Cross-route prefetch race/degraded UX |
| 15 | `/tools/revenue-estimate` aborted RSC request (`/signals`) | transient_network | 4 request failures | Tool page bootstrap instability |

## Release-blocking failures (5)

| Blocker | Why release-blocking | Category | Escalation owner |
|---|---|---|---|
| `/skills` and `/compare` `503 resource load` | 503s indicate backend/service unavailability on critical discovery + compare surfaces | data | Platform engineer |
| `/mcp` and `/reddit/trending` aborted `/api/pipeline/sidebar-data` | Shared data endpoint instability can degrade multiple routes at once | data | Platform engineer |
| `/bluesky/trending` repeated `404 resource load` (22 console + 27 request failures) | Highest multi-error concentration on a live signal terminal | ui | Frontend engineer |
| `/devto` and `/producthunt` `ERR_BLOCKED_BY_ORB` external image failures | Persistent media blocking creates visible breakage and low-quality release perception | external_asset | Frontend engineer (fallback strategy), Data pipeline engineer (image proxy policy) |
| `/consensus` + `/collections` high aborted RSC request counts (13 and 12) | High abort volume implies unstable hydration/prefetch path and potential user-visible incompleteness | transient_network | Platform engineer |

## Binary QA outcome for AGN-164
- `Top 15 recurring failures with category and impact`: GREEN.
- `5 failures that should block release`: GREEN.
- `Escalation owner per blocking failure`: GREEN.

## Residual risk
- Local verification remains environment-blocked in this heartbeat because `localhost:3023` is down (`ECONNREFUSED`), so this taxonomy update is based on latest audited production evidence rather than fresh local browser reruns.
