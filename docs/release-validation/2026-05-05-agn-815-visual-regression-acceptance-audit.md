# AGN-815 QA acceptance audit (2026-05-05)

## Issue
- `AGN-815` — `[TEST-2] Visual regression — Percy or Chromatic for critical components`

## Mandatory opening + freshness preflight
- Opening bundle re-read:
  - `CLAUDE.md`
  - `docs/ENGINE.md`
  - `docs/SITE-WIREMAP.md`
  - `docs/AUDIT-2026-05-04.md`
  - `docs/forensic/00-INDEX.md`
  - `tasks/CURRENT-SPRINT.md`
  - `tasks/BACKLOG.md`
- Freshness command: `npm run freshness:check`
- Result: failed; localhost reachable but degraded: `GET /api/health?soft=1 -> HTTP 500 Internal Server Error`

## Objective compliance matrix

| Objective requirement | Verification evidence | Status |
|---|---|---|
| Snapshot 12 highest-traffic pages | `tests/e2e/visual/v3-surfaces.spec.ts` defines 5 pages only (`/`, `/repo/vercel/next.js`, `/signals`, `/hackernews/trending`, `/admin`) | RED |
| Capture at 1280px and 375px | Spec uses only `VIEWPORT = { width: 1280, height: 800 }`; no 375px suite | RED |
| Diff on every PR | `.github/workflows/ci.yml` explicitly excludes visual suite: `--grep-invert "V3 visual surfaces"` | RED |
| Block merge on >5% pixel deviation without justification | No Percy/Chromatic status check; current Playwright threshold is per-test `maxDiffPixelRatio: 0.02` and not running in PR gate | RED |
| Percy/Chromatic baseline established + CI check wired | No Percy/Chromatic package/workflow wiring; no committed visual baseline screenshots in `tests/e2e/visual/__screenshots__/` | RED |

## Additional implementation reality checks
- No Percy/Chromatic integration found in scripts/dependencies/workflows.
- Visual baseline directory absent in repository snapshot (`tests/e2e/visual` contains only `v3-surfaces.spec.ts`).

## QA conclusion
- Acceptance is **NOT MET** for AGN-815.
- Classification: **product gap** (required implementation incomplete), plus local environment degradation (`/api/health` 500) that also weakens visual-run reliability.

## Unblock owner/action
- Owner: frontend/platform implementation owner
- Required action:
  1. Implement canonical visual-regression platform for AGN-815 (Percy/Chromatic or approved equivalent).
  2. Expand coverage to 12 highest-traffic pages at both desktop and mobile viewport targets (1280 + 375).
  3. Wire visual diff check into PR CI as a merge-blocking gate and document justification override path.
  4. Establish and commit/reference baseline artifacts compatible with CI execution.
