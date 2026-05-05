# AGN-266 Browser Smoke Matrix for Priority Routes (2026-05-04)

Issue: `AGN-266`  
Scope: release QA browser smoke matrix for priority routes with same-heartbeat freshness preflight.

## Mandatory opening + freshness preflight
- Mandatory opening bundle completed: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Command: `npm run freshness:check`
- Checked at: `2026-05-04T10:48:14.158Z`
- Localhost status: `http://localhost:3023` reachable (not missing)
- Freshness verdict: `health=ok sourceStatus=degraded`
- Summary: `green=44 yellow=1 red=0 dead=5 blocking_non_green=5 advisory_non_green=1`
- Blocking non-green rows: `category-metrics=DEAD`, `mcp-downloads=DEAD`, `star-snapshots=DEAD`, `trending-repos=DEAD`, `reddit=YELLOW`
- Sentry row: `MISSING`

## Browser smoke execution

### A) Critical-path Playwright spec
- Command: `npx playwright test tests/e2e/critical-paths.spec.ts --reporter=line`
- Outcome: `2 passed, 2 failed`

| Spec | Route | Binary result | Failure type |
|---|---|---|---|
| home renders | `/` | GREEN | n/a |
| compare renders | `/compare?repos=vercel/next.js,facebook/react` | GREEN | n/a |
| signals renders | `/signals` | RED | Product/test-contract failure (`[data-surface='signals-primary-feeds']` not found) |
| repo-detail renders | `/repo/vercel/next.js` | RED | Product/test-contract failure (`[data-repo-id-strip='1']` not found) |

Artifacts:
- `test-results/critical-paths-critical-paths-signals-renders-chromium-retry1/trace.zip`
- `test-results/critical-paths-critical-paths-repo-detail-renders-chromium-retry1/trace.zip`

### B) Priority route browser matrix (Chromium, 1366x768)
- Base URL: `http://localhost:3023`
- Checked at: `2026-05-04T10:52:34.974Z`
- Capture: HTTP status, title, body chars, console error count, request failure count

| Route | HTTP | Body chars | Console errors | Request failures | First observed failure |
|---|---:|---:|---:|---:|---|
| `/` | 200 | 10265 | 0 | 1 | `ERR_BLOCKED_BY_ORB` (external smithery icon) |
| `/signals` | 200 | 13209 | 1 | 1 | hydration mismatch warning + aborted `/api/pipeline/sidebar-data` |
| `/repo/vercel/next.js` | 200 | 829 | 0 | 0 | none |
| `/compare?repos=vercel/next.js,facebook/react` | 200 | 2324 | 6 | 0 | repeated empty-attribute warnings |
| `/skills` | 200 | 120574 | 3 | 14 | `/api/compare/payloads` failed fetch + aborted compare/sidebar requests |
| `/mcp` | 200 | 829 | 0 | 4 | aborted `/api/pipeline/sidebar-data` |
| `/twitter` | 200 | 2143 | 4 | 37 | multiple `404`/external image `ERR_BLOCKED_BY_ORB` failures |
| `/top10` | 200 | 3207 | 0 | 0 | none |

## QA classification (required)
- Environment blocker: `NO` (localhost reachable; browser checks executed)
- Product failure: `YES` (freshness gate non-green + failing critical-path locator contracts + high request-failure noise on priority routes)

## Acceptance decision for AGN-266
- Priority-route browser smoke matrix delivered: `GREEN`
- Priority-route acceptance status: `RED`
- Release recommendation: `BLOCKED` until blocking freshness rows clear and critical-path selector contracts are restored/re-baselined.

## Residual risk
- Route-level HTTP 200 currently overstates health because data freshness and selector-level contracts are failing.
- `/skills`, `/mcp`, `/twitter`, and `/signals` still show error/noise patterns that can mask regressions.
