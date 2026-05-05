# AGN-305 Browser Smoke Delta on Priority Routes (2026-05-04)

Issue: `AGN-305`  
Scope: release QA delta re-check for priority-route browser smoke with same-heartbeat freshness preflight.

## Mandatory opening + freshness preflight
- Mandatory opening bundle completed: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Command: `npm run freshness:check`
- Checked at: `2026-05-04T11:10:57.125Z`
- Localhost status: `http://localhost:3023` reachable (not missing)
- Freshness verdict: `health=ok sourceStatus=degraded`
- Summary: `green=45 yellow=0 red=0 dead=5 blocking_non_green=4 advisory_non_green=1`
- Blocking non-green rows: `category-metrics=DEAD`, `mcp-downloads=DEAD`, `star-snapshots=DEAD`, `trending-repos=DEAD`
- Advisory non-green row: `model-usage=DEAD`
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
- Checked at: `2026-05-04` same heartbeat
- Capture: HTTP status, title, body chars, console error count, request failure count

| Route | HTTP | Body chars | Console errors | Request failures | First observed failure |
|---|---:|---:|---:|---:|---|
| `/` | 200 | 10398 | 1 | 1 | `ERR_BLOCKED_BY_ORB` (smithery icon) |
| `/signals` | 200 | 12942 | 0 | 0 | none |
| `/repo/vercel/next.js` | 200 | 17211 | 0 | 0 | none |
| `/compare?repos=vercel/next.js,facebook/react` | 200 | 2579 | 6 | 2 | aborted local RSC request (`/compare?_rsc=...`) |
| `/skills` | 200 | 120874 | 1 | 0 | hydration mismatch (non-deterministic SVG gradient ids) |
| `/mcp` | 200 | 31022 | 5 | 8 | external icon `HTTP 404` |
| `/twitter` | 200 | 2147 | 0 | 16 | external avatar `ERR_BLOCKED_BY_ORB` |
| `/top10` | 200 | 3211 | 0 | 0 | none |

## Delta vs AGN-266 baseline (same date)
- Freshness still non-green and release-blocking (`blocking_non_green` improved `5 -> 4`; still RED acceptance).
- Critical-path spec remained unchanged at `2 pass / 2 fail` with the same failing selector contracts.
- `/signals` matrix noise improved (`errors/failures` now `0/0`), but acceptance remains RED due to selector failures + freshness dead blockers.
- `/twitter` request-failure volume improved (`37 -> 16`) but remains noisy from external avatar/image failures.
- `/mcp` matrix now surfaces higher client noise than AGN-266 (`console/request` now `5/8`).

## QA classification (required)
- Environment blocker: `NO` (localhost reachable; browser checks executed)
- Product failure: `YES` (blocking freshness rows remain DEAD + failing critical-path selector contracts)

## Acceptance decision for AGN-305
- Priority-route browser smoke delta delivered: `GREEN`
- Priority-route acceptance status: `RED`
- Release recommendation: `BLOCKED` until blocking freshness rows clear and critical-path selector contracts are restored/re-baselined.

## Residual risk
- Route HTTP 200 status still overstates product readiness while freshness gate has blocking DEAD rows.
- Selector-contract drift can hide UI regressions by failing on critical surfaces before meaningful assertions.
