---
status: archive
audit-date: 2026-05-05
reason: dated release-validation heartbeat artifact
---

# AGN-163 QA Checklist Matrix - Source Freshness Critical Paths (2026-05-04)

## Scope
- Issue: `AGN-163`
- Goal: release QA checklist for freshness-critical paths with binary checks, evidence methods, and release impact tags.
- Required surfaces: `trending`, `signals`, `twitter`, `funding`, `mcp`, `skills`.

## Mandatory opening + current preflight
- Mandatory opening bundle re-read in this heartbeat: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Preflight command: `npm run freshness:check`
- Latest run in this heartbeat: `ECONNREFUSED` (`localhost:3023` missing)
- Classification for this heartbeat: environment blocker for live local verification.

## Release QA checklist (definition)

| Surface | Freshness/API check (binary) | Browser check (binary) | Evidence method | Release tag |
|---|---|---|---|---|
| `trending` (`/`) | PASS if `freshness:check` has no blocking non-green rows for `trending-repos`/`deltas`; FAIL otherwise | PASS if `/` returns 200 and primary home surface is visible; FAIL otherwise | `npm run freshness:check`; `npx playwright test tests/e2e/critical-paths.spec.ts --grep "home renders"` | BLOCKING |
| `signals` (`/signals`) | PASS if source rows backing signals (`hackernews`, `bluesky`, `devto`, `trending-repos`) are within budgets; FAIL otherwise | PASS if `/signals` returns 200 and primary signals surface selector is visible; FAIL otherwise | `npm run freshness:check`; `npx playwright test tests/e2e/critical-paths.spec.ts --grep "signals renders"` | BLOCKING |
| `twitter` (`/twitter`) | PASS if `twitter` freshness row is GREEN and within 12h budget; FAIL otherwise | PASS if `/twitter` returns 200 and table/list surface renders at least one row or explicit empty-state; FAIL otherwise | `npm run freshness:check`; targeted Playwright route check or screenshot capture | BLOCKING |
| `funding` (`/funding`) | PASS if funding freshness rows (`funding-news`, `funding-crunchbase`, `funding-x`) are GREEN; FAIL otherwise | PASS if `/funding` returns 200 and funding list/cards render or explicit empty-state; FAIL otherwise | `npm run freshness:check`; targeted Playwright route check or screenshot capture | BLOCKING |
| `mcp` (`/mcp`) | PASS if `trending-mcp`, `mcp-downloads`, `mcp-liveness`, `mcp-usage-snapshot` rows are GREEN; FAIL otherwise | PASS if `/mcp` returns 200 and MCP list/grid renders with liveness indicators; FAIL otherwise | `npm run freshness:check`; targeted Playwright route check or screenshot capture | BLOCKING |
| `skills` (`/skills`) | PASS if `trending-skills`, `skill-sidechannels`, `skill-install-snapshots` freshness rows are GREEN or approved advisory-only; FAIL otherwise | PASS if `/skills` returns 200 and skill leaderboard/list renders; FAIL otherwise | `npm run freshness:check`; targeted Playwright route check or screenshot capture | ADVISORY (unless tied to release focus) |

## Execution snapshot (evidence from this issue run history)

### A) Last successful local preflight evidence in AGN-163 run history
- Command: `npm run freshness:check`
- Recorded at: `2026-05-04T09:26:07.465Z`
- Result: `green=46 yellow=0 red=0 dead=4 blocking_non_green=4 advisory_non_green=0`
- Blocking DEAD rows: `category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`
- `Sentry: MISSING`

### B) Critical-path browser evidence in AGN-163 run history
- Command: `npx playwright test tests/e2e/critical-paths.spec.ts --reporter=line`
- Result: `2 passed, 2 failed`
- Passed: `home renders`, `compare renders`
- Failed: `signals renders` (missing `[data-surface='signals-primary-feeds']`), `repo-detail renders` (missing `[data-repo-id-strip='1']`)
- Artifacts:
  - `test-results/critical-paths-critical-paths-signals-renders-chromium-retry1/trace.zip`
  - `test-results/critical-paths-critical-paths-repo-detail-renders-chromium-retry1/trace.zip`

### C) Current heartbeat state
- `npm run freshness:check` now fails early with `ECONNREFUSED` to `http://localhost:3023`.
- Interpretation: cannot run new browser/API local checks in this heartbeat until local app is restored.

## Acceptance status for AGN-163 deliverable
- Checklist definition for all six required surfaces: COMPLETE
- Pass/fail criteria per check: COMPLETE
- Command/browser evidence method per check: COMPLETE
- Blocking vs advisory tagging per check: COMPLETE

## Residual risk
- Checklist is complete, but current local environment outage (`localhost:3023` down) prevents fresh execution evidence in this heartbeat.
- Last known execution evidence remains RED on blocking freshness plus selector-contract failures.
