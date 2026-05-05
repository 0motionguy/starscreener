# AGN-1045 [Sprint 1 audit] Cron overlap and duplicate writer risk review (2026-05-05)

Issue: AGN-1045  
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
- Freshness evidence (`npm run freshness:check`, 2026-05-05 heartbeat):
  - localhost `http://localhost:3023` is reachable (not missing),
  - but `GET /api/cron/freshness/state` returns `HTTP 500 Internal Server Error`,
  - classification: product stale/degraded, not localhost-missing.

## Live ops inspection status

- `gh workflow list --limit 200` -> `HTTP 401 Bad credentials`
- `gh run list --limit 80 --json ...` -> `HTTP 401 Bad credentials`
- Result: live Actions run-state verification is blocked by missing/expired GitHub auth in this heartbeat.

## Current cron overlap evidence (workflow files)

- `.github/workflows/scrape-trending.yml:5` -> `cron: "7,27,47 * * * *"`
- `.github/workflows/sync-trustmrr.yml:8` -> `cron: "27 2 * * *"`
- `.github/workflows/sync-trustmrr.yml:11` -> hourly at `:27` for all non-02 UTC hours
- `.github/workflows/refresh-collection-rankings.yml:5` -> `cron: "17 */6 * * *"`
- `.github/workflows/scrape-bluesky.yml:5` -> `cron: "17 * * * *"`
- `.github/workflows/refresh-star-activity.yml:11` -> `cron: "17 3 * * *"`
- `.github/workflows/refresh-reddit-baselines.yml:5` -> `cron: "17 3 * * 1"`

Interpretation: minute-17 and minute-27 windows are still contention clusters.

## Duplicate writer risk (verified key collisions)

1) `collection-rankings`
- GHA writer: `.github/workflows/refresh-collection-rankings.yml:39` runs `node scripts/scrape-trending.mjs --only-collection-rankings`
- Worker writer: `apps/trendingrepo-worker/src/fetchers/collection-rankings/index.ts:192` writes `writeDataStore('collection-rankings', payload)`
- Worker schedule: `apps/trendingrepo-worker/src/fetchers/collection-rankings/index.ts:138` -> `schedule: '17 */6 * * *'`
- Risk: same key, same cadence window, two schedulers.

2) `trending` and `hot-collections`
- GHA writer: `.github/workflows/scrape-trending.yml:40` runs `node scripts/scrape-trending.mjs --skip-collection-rankings`
- Worker writer: `apps/trendingrepo-worker/src/fetchers/oss-trending/index.ts:170-171` writes both keys
- Worker schedule: `apps/trendingrepo-worker/src/fetchers/oss-trending/index.ts:112` -> `schedule: '22 * * * *'`
- Risk: two ingestion lanes write the same key family.

3) `devto-trending` and `devto-mentions`
- GHA writer: `scripts/scrape-devto.mjs:414-415`
- GHA cadence: `.github/workflows/scrape-devto.yml:5` -> `cron: "18 */6 * * *"`
- Worker writer: `apps/trendingrepo-worker/src/fetchers/devto/index.ts:318-319`
- Worker schedule: `apps/trendingrepo-worker/src/fetchers/devto/index.ts:153` -> `schedule: '30 8 * * *'`
- Risk: dual writers; cadence mismatch can cause stale/new flips.

4) `reddit-mentions` and `reddit-all-posts`
- GHA writer: `scripts/scrape-reddit.mjs:965,998` (invoked from scrape-trending lane)
- GHA cadence root: `.github/workflows/scrape-trending.yml:5` -> `cron: "7,27,47 * * * *"`
- Worker writer: `apps/trendingrepo-worker/src/fetchers/reddit/index.ts:277,296`
- Worker schedule: `apps/trendingrepo-worker/src/fetchers/reddit/index.ts:110` -> `schedule: '30 * * * *'`
- Risk: same keys updated by independent hourly/tri-hourly flows.

5) `producthunt-launches`
- GHA writer: `scripts/scrape-producthunt.mjs:464`
- GHA cadence: `.github/workflows/scrape-producthunt.yml:5` -> `cron: "22 11,15,19,23 * * *"`
- Worker writer: `apps/trendingrepo-worker/src/fetchers/producthunt/index.ts:379`
- Worker schedule: `apps/trendingrepo-worker/src/fetchers/producthunt/index.ts:207` -> `schedule: '0 11,15,19,23 * * *'`
- Risk: same windows, separate writers.

6) `revenue-overlays` and `trustmrr-startups`
- GHA writer: `scripts/sync-trustmrr.mjs:136-137,164-165,201`
- GHA cadence: `.github/workflows/sync-trustmrr.yml:8,11` (hourly at `:27`)
- Worker writer: `apps/trendingrepo-worker/src/fetchers/trustmrr/index.ts:146,192`
- Worker schedule: `apps/trendingrepo-worker/src/fetchers/trustmrr/index.ts:155` -> `schedule: '27 * * * *'`
- Risk: identical minute + duplicate writes.

7) `deltas`
- GHA writer: `.github/workflows/scrape-trending.yml:80` runs `node scripts/compute-deltas.mjs`; script write at `scripts/compute-deltas.mjs:244`
- Worker writer: `apps/trendingrepo-worker/src/fetchers/deltas/index.ts:342`
- Worker schedule: `apps/trendingrepo-worker/src/fetchers/deltas/index.ts:181` -> `schedule: '40 * * * *'`
- Risk: split ownership for a high-fanout key.

## Release safety decision (this heartbeat)

- Status: **BLOCKED**
- Blocker 1: live workflow/cron run-state cannot be inspected because GitHub auth is invalid (`gh` 401).
- Blocker 2: duplicate writers remain active on critical keys; no single-writer cutover has been applied in this heartbeat.
- Needed to unblock:
  - CTO/platform restore GitHub CLI/API credentials for this repo,
  - platform/data pipeline owner approve and execute single-writer ownership cutover for the key families above.

## Rollback readiness (verified path)

- Cron changes are rollbackable by reverting schedule lines under `.github/workflows/*.yml`.
- Writer ownership rollback requires restoring the previous non-primary writer path and rerunning one manual workflow dispatch per affected key to re-seed.
