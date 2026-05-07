# AGN-1045 [Sprint 1 audit] Cron overlap and duplicate writer risk review (2026-05-05)

Issue: AGN-1045  
Owner lane: [OPS] Release SRE

## Current heartbeat evidence

- `curl.exe -sS -m 6 $PAPERCLIP_API_URL/api/health` -> failed to connect to `http://192.168.192.1:3100` (control plane unreachable).
- `gh auth status` -> active `GITHUB_TOKEN` invalid for GitHub API usage in this runtime.
- `npm run freshness:check` -> localhost reachable but stale/degraded; `/api/cron/freshness/state` returns `HTTP 500`.

## Cron overlap evidence (workflow schedules)

- `.github/workflows/scrape-trending.yml:5` -> `cron: "7,27,47 * * * *"`
- `.github/workflows/sync-trustmrr.yml:8,11` -> daily `02:27` + hourly `:27` (other hours)
- `.github/workflows/refresh-collection-rankings.yml:5` -> `cron: "17 */6 * * *"`
- `.github/workflows/scrape-bluesky.yml:5` -> `cron: "17 * * * *"`
- `.github/workflows/refresh-star-activity.yml:11` -> `cron: "17 3 * * *"`
- `.github/workflows/refresh-reddit-baselines.yml:5` -> `cron: "17 3 * * 1"`

Interpretation: contention clusters remain around minute `:17` and minute `:27`.

## Duplicate writer evidence (same keys written by workflow scripts and worker fetchers)

1) `collection-rankings`
- Workflow script path: `.github/workflows/refresh-collection-rankings.yml:39` (`--only-collection-rankings`)
- Worker writer: `apps/trendingrepo-worker/src/fetchers/collection-rankings/index.ts:192`
- Worker schedule: `apps/trendingrepo-worker/src/fetchers/collection-rankings/index.ts:138` (`17 */6 * * *`)

2) `trending` / `hot-collections`
- Workflow script path: `.github/workflows/scrape-trending.yml:40` (`--skip-collection-rankings`)
- Worker writer: `apps/trendingrepo-worker/src/fetchers/oss-trending/index.ts:170-171`
- Worker schedule: `apps/trendingrepo-worker/src/fetchers/oss-trending/index.ts:112` (`22 * * * *`)

3) `devto-mentions` / `devto-trending`
- Workflow writer: `scripts/scrape-devto.mjs:414-415`, cadence `.github/workflows/scrape-devto.yml:5`
- Worker writer: `apps/trendingrepo-worker/src/fetchers/devto/index.ts:318-319`

4) `reddit-mentions` / `reddit-all-posts`
- Workflow writer: `scripts/scrape-reddit.mjs:965,998` (from `scrape-trending` lane)
- Worker writer: `apps/trendingrepo-worker/src/fetchers/reddit/index.ts:277,296`
- Worker schedule: `apps/trendingrepo-worker/src/fetchers/reddit/index.ts:110` (`30 * * * *`)

5) `producthunt-launches`
- Workflow writer: `scripts/scrape-producthunt.mjs:464`, cadence `.github/workflows/scrape-producthunt.yml:5`
- Worker writer: `apps/trendingrepo-worker/src/fetchers/producthunt/index.ts:379`
- Worker schedule: `apps/trendingrepo-worker/src/fetchers/producthunt/index.ts:207`

6) `trustmrr-startups` / `revenue-overlays`
- Workflow writer: `scripts/sync-trustmrr.mjs:136-137,164-165,201`, cadence `.github/workflows/sync-trustmrr.yml:8,11`
- Worker writer: `apps/trendingrepo-worker/src/fetchers/trustmrr/index.ts:146,192`
- Worker schedule: `apps/trendingrepo-worker/src/fetchers/trustmrr/index.ts:155` (`27 * * * *`)

7) `deltas`
- Workflow writer path: `.github/workflows/scrape-trending.yml:80` -> `scripts/compute-deltas.mjs:244`
- Worker writer: `apps/trendingrepo-worker/src/fetchers/deltas/index.ts:342`
- Worker schedule: `apps/trendingrepo-worker/src/fetchers/deltas/index.ts:181` (`40 * * * *`)

## Deconfliction recommendations (priority)

1. P0: declare one primary writer per key family above in `docs/ENGINE.md`; move non-primary lane to manual break-glass mode.
2. P1: eliminate minute-27 trustmrr dual-lane overlap (keep worker primary, workflow manual fallback).
3. P1: resolve minute-17 contention by splitting high-cost jobs across non-adjacent minutes.
4. P2: add writer-provenance tag checks in freshness status so stale-vs-overwritten states are explicit.

## Blocked state for issue close-loop

- Required issue-thread POST/PATCH could not be persisted because Paperclip API is unreachable from this host.
- Unblock owner: platform/CTO.
- Needs: restore Paperclip API connectivity from runtime to `http://192.168.192.1:3100`, then rerun heartbeat to submit evidence comment and terminal status patch.
