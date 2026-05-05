# AGN-815 QA heartbeat (2026-05-04): visual regression verification blocked

## Scope
- Issue: `AGN-815` — `[TEST-2] Visual regression — Percy or Chromatic for critical components`
- Role: Release QA

## Mandatory opening completion
- Read: `CLAUDE.md`
- Read: `docs/ENGINE.md`
- Read: `docs/SITE-WIREMAP.md`
- Read: `docs/AUDIT-2026-05-04.md`
- Read: `docs/forensic/00-INDEX.md`
- Read: `tasks/CURRENT-SPRINT.md`
- Read: `tasks/BACKLOG.md`

## Freshness preflight evidence
- Command: `npm run freshness:check`
- Result: localhost `3023` reachable (not missing), but product stale/degraded.
- Summary: `green=45 yellow=4 red=1 dead=0 blocking_non_green=5 advisory_non_green=0`
- Blocking non-green sources: `bluesky` (RED), `npm` (YELLOW), `producthunt` (YELLOW), `trending-repos` (YELLOW), `twitter` (YELLOW)
- Sentry readiness: `Sentry: MISSING`

## Visual regression implementation reality
- No Percy/Chromatic integration found in `package.json` scripts/deps or workflow inventory.
- Playwright visual suite exists: `tests/e2e/visual/v3-surfaces.spec.ts`.
- Baseline snapshot directory `tests/e2e/visual/__screenshots__/` is absent in this workspace.

## Visual verification run
- Command:
  - `$env:STARSCREENER_BASE_URL='http://localhost:3023'; npx playwright test tests/e2e/visual/v3-surfaces.spec.ts --reporter=line`
- Result: `5/5` failed.
- Failure mode classification: environment blocker (transport/server instability), not product-diff assertions.
- Primary errors:
  - `net::ERR_CONNECTION_RESET` on `/`
  - `net::ERR_CONNECTION_REFUSED` on `/`, `/repo/vercel/next.js`, `/signals`, `/hackernews/trending`
  - timeout on `/admin`
- Artifacts emitted: `test-results/visual-v3-surfaces-*` (screenshots, error contexts, traces)

## Acceptance decision
- Status: **BLOCKED**
- Why blocked:
  1. Visual harness cannot complete stable navigation across critical pages.
  2. No Percy/Chromatic pipeline is present for this ticket scope.
  3. Freshness preflight remains blocking non-green.

## Unblock owner/action
- Owner: Platform engineer
- Action:
  1. Stabilize local/dev server lifecycle on `localhost:3023` so Playwright can complete all 5 visual routes without connection resets/refusals.
  2. Restore freshness to `blocking_non_green=0`.
  3. Implement/confirm canonical visual regression pipeline target for AGN-815 (Percy/Chromatic or approved Playwright-baseline contract) and rerun QA.
