# AGN-1208 [Sprint 1 audit] Release/SRE cron overlap and duplicate-writer risk sweep (2026-05-05)

Issue: AGN-1208  
Owner lane: [OPS] Release SRE

## Mandatory opening + freshness preflight

- Mandatory opening bundle completed this heartbeat:
  - `CLAUDE.md`
  - `docs/ENGINE.md`
  - `docs/SITE-WIREMAP.md`
  - `docs/AUDIT-2026-05-04.md`
  - `docs/forensic/00-INDEX.md`
  - `tasks/CURRENT-SPRINT.md`
  - `tasks/BACKLOG.md`
- Freshness evidence (`npm run freshness:check`):
  - localhost `http://localhost:3023` is reachable (not missing),
  - `GET /api/health?soft=1` returned `HTTP 500 Internal Server Error`,
  - classification: product stale/degraded (not localhost-missing).

## Live ops inspection status

- Initial failure mode:
  - `gh workflow list --limit 200` -> `HTTP 401 Bad credentials`
  - `gh run list --limit 40 --json ...` -> `HTTP 401 Bad credentials`
- Root cause:
  - runtime `GITHUB_TOKEN` env var is invalid and overrides keyring auth.
- Recovery used in this heartbeat:
  - run commands with process-local override: `$env:GITHUB_TOKEN=$null`.
- Live verification after recovery:
  - `gh workflow list --limit 20` succeeded.
  - `gh run list --limit 20 --json workflowName,status,conclusion,createdAt,updatedAt` succeeded.
  - Recent failures observed live include:
    - `Refresh Lobsters signals` (failure),
    - `Sync TrustMRR revenue overlays` (failure),
    - `Refresh Bluesky signals` (failure),
    - `Audit - source freshness` (failure),
    - `Refresh ProductHunt launches` (failure),
    - `Cron - freshness check` (failure),
    - `Source health watch` (failure).

## Current overlap evidence (workflow cron schedule)

- `scrape-trending.yml` runs at `7,27,47 * * * *`.
- `sync-trustmrr.yml` runs daily at `27 2 * * *` plus hourly `:27` in all other UTC hours.
- `scrape-bluesky.yml` runs at `17 * * * *`.
- `refresh-collection-rankings.yml` runs at `17 */6 * * *`.
- `refresh-star-activity.yml` runs at `17 3 * * *`.
- `refresh-reddit-baselines.yml` runs at `17 3 * * 1`.
- `cron-freshness-check.yml` runs every 15m and `audit-freshness.yml` runs hourly at `:08`.

Interpretation: minute `:17` and `:27` remain active contention windows; freshness checks still run in multiple independent jobs.

## Verified duplicate-writer risk (same key, multiple schedulers)

1) `collection-rankings`
- GHA writer: `.github/workflows/refresh-collection-rankings.yml` -> `node scripts/scrape-trending.mjs --only-collection-rankings`
- Worker writer: `apps/trendingrepo-worker/src/fetchers/collection-rankings/index.ts` (`writeDataStore("collection-rankings", ...)`)

2) `trending` and `hot-collections`
- GHA writer: `.github/workflows/scrape-trending.yml` -> `node scripts/scrape-trending.mjs --skip-collection-rankings`
- Worker writer: `apps/trendingrepo-worker/src/fetchers/oss-trending/index.ts`

3) `devto-trending` and `devto-mentions`
- GHA writer: `scripts/scrape-devto.mjs`
- Worker writer: `apps/trendingrepo-worker/src/fetchers/devto/index.ts`

4) `reddit-mentions` and `reddit-all-posts`
- GHA writer: `scripts/scrape-reddit.mjs` (through scrape-trending lane)
- Worker writer: `apps/trendingrepo-worker/src/fetchers/reddit/index.ts`

5) `producthunt-launches`
- GHA writer: `scripts/scrape-producthunt.mjs`
- Worker writer: `apps/trendingrepo-worker/src/fetchers/producthunt/index.ts`

6) `revenue-overlays` and `trustmrr-startups`
- GHA writer: `scripts/sync-trustmrr.mjs`
- Worker writer: `apps/trendingrepo-worker/src/fetchers/trustmrr/index.ts`

7) `deltas`
- GHA writer: `scripts/compute-deltas.mjs` (from scrape-trending workflow)
- Worker writer: `apps/trendingrepo-worker/src/fetchers/deltas/index.ts`

## Release safety decision (this heartbeat)

- Status: **ACTIONABLE (not blocked)**
- Live workflow state is now inspectable when `GITHUB_TOKEN` override is cleared in-shell.
- Duplicate-writer risk remains open and requires ownership cutover decisions.

## Blast radius estimate (by key family)

- Tier 0 (site-wide high fan-out): `trending`, `deltas`, `collection-rankings`
- Tier 1 (major traffic sections): `reddit-*`, `devto-*`, `producthunt-launches`, `trustmrr-startups`, `revenue-overlays`
- Tier 2 (narrow surface): remaining duplicated keys with single-page impact

## Containment order (recommended)

1. Freeze and assign single writer for Tier 0 keys (`trending`, `deltas`, `collection-rankings`).
2. Freeze and assign single writer for Tier 1 keys (`reddit-*`, `devto-*`, `producthunt-launches`, `trustmrr*`).
3. Keep non-owner lane as read/verify only; disable overlapping cron writer step per key family.
4. Verify via `gh run list` + freshness probe that key timestamps advance from exactly one writer lane.
5. Keep rollback prepared by preserving previous schedule lines and manual dispatch paths.

## Operator unblock criteria (explicit)

- If `gh` shows `HTTP 401 Bad credentials`:
  1. Verify status: `gh auth status`
  2. Run this process-local command before GH checks: `$env:GITHUB_TOKEN=$null`
  3. Re-run: `gh workflow list --limit 20` and `gh run list --limit 20`
  4. If still failing, rotate token at `https://github.com/settings/tokens` and re-authenticate with `gh auth login`.

## Rollback readiness

- Cron rollback path: revert schedule lines in `.github/workflows/*.yml` and run manual `workflow_dispatch` smoke for touched workflows.
- Writer rollback path: restore previous writer for each key family, then run one manual refresh per key family to re-seed canonical timestamps.
