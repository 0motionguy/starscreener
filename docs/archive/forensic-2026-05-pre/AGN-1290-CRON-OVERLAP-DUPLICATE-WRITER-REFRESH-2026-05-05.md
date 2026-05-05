# AGN-1290 cron overlap and duplicate writer risk refresh (2026-05-05)

Issue: AGN-1290  
Owner lane: [OPS] Release SRE

## Mandatory opening + freshness preflight
- Mandatory opening bundle completed this heartbeat: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` at 2026-05-05 local heartbeat:
  - `request timed out while contacting http://localhost:3023`
  - Interpretation: localhost:3023 unreachable in this run (missing/unhealthy local stack).

## 1) Overlap map update (live + config)
Live run-state source: public GitHub API (`GET /repos/0motionguy/starscreener/actions/runs?per_page=100`) at heartbeat time.

High-contention schedule windows:
- `:27` minute window:
  - `.github/workflows/scrape-trending.yml` -> `7,27,47 * * * *`
  - `.github/workflows/sync-trustmrr.yml` -> `27 * * * *` (plus dedicated 02:27 full mode)
- `:17` minute window:
  - `.github/workflows/scrape-bluesky.yml` -> `17 * * * *`
  - `.github/workflows/refresh-collection-rankings.yml` -> `17 */6 * * *`
  - `.github/workflows/refresh-star-activity.yml` -> `17 3 * * *`
  - `.github/workflows/refresh-reddit-baselines.yml` -> `17 3 * * 1`
- Freshness/watch overlap lane:
  - `.github/workflows/cron-freshness-check.yml` -> `*/15 * * * *`
  - `.github/workflows/audit-freshness.yml` -> `8 * * * *`
  - `.github/workflows/health-watch.yml` -> `*/30 * * * *`

Live-state sample for key workflows (latest runs from API):
- `scrape-trending`: `25349394588` failure, `25347040280` failure, `25343958282` failure
- `scrape-devto`: `25339835474` failure
- `collect-twitter`: `25345476405` failure, `25338052433` success, `25330238552` failure
- `refresh-collection-rankings`: `25340207526` failure
- `sync-trustmrr`: `25350636943` failure, `25347037107` failure, `25342482467` failure
- `health-watch`: `25349658125` failure, `25347727458` failure, `25345526509` failure
- `cron-freshness-check`: `25349814827` failure, `25347910324` success, `25345640192` failure

## 2) Conflicting writer pairs (verified duplicate-writer risk)
Each row below has both a GitHub Actions writer and a Railway worker writer targeting same key family:

1. `collection-rankings`
- GHA: `.github/workflows/refresh-collection-rankings.yml` -> `scripts/scrape-trending.mjs --only-collection-rankings`
- Worker: `apps/trendingrepo-worker/src/fetchers/collection-rankings/index.ts`

2. `trending` and `hot-collections`
- GHA: `.github/workflows/scrape-trending.yml` -> `scripts/scrape-trending.mjs --skip-collection-rankings`
- Worker: `apps/trendingrepo-worker/src/fetchers/oss-trending/index.ts`

3. `devto-trending` and `devto-mentions`
- GHA: `.github/workflows/scrape-devto.yml` -> `scripts/scrape-devto.mjs`
- Worker: `apps/trendingrepo-worker/src/fetchers/devto/index.ts`

4. `reddit-mentions` and `reddit-all-posts`
- GHA: `.github/workflows/scrape-trending.yml` path calling `scripts/scrape-reddit.mjs`
- Worker: `apps/trendingrepo-worker/src/fetchers/reddit/index.ts`

5. `producthunt-launches`
- GHA: `.github/workflows/scrape-producthunt.yml` -> `scripts/scrape-producthunt.mjs`
- Worker: `apps/trendingrepo-worker/src/fetchers/producthunt/index.ts`

6. `revenue-overlays` and `trustmrr-startups`
- GHA: `.github/workflows/sync-trustmrr.yml` -> `scripts/sync-trustmrr.mjs`
- Worker: `apps/trendingrepo-worker/src/fetchers/trustmrr/index.ts`

7. `deltas`
- GHA: `.github/workflows/scrape-trending.yml` -> `scripts/compute-deltas.mjs`
- Worker: `apps/trendingrepo-worker/src/fetchers/deltas/index.ts`

## 3) Impact assessment
- Reliability impact: high. Multiple key workflows are repeatedly failing in live runs, increasing stale-key and drift risk.
- Consistency impact: high for duplicated keys; last-writer-wins behavior can hide provenance and produce cross-surface inconsistency.
- Release safety impact: medium-high. Overlap windows (`:17`, `:27`) increase simultaneous write pressure and complicate incident triage.

## 4) Mitigation recommendations with owners
1. Owner: Platform engineer
- Action: move minute-level overlap by shifting one of `scrape-trending` or `sync-trustmrr` off `:27` and deconflict `:17` cluster.
- Done when: updated cron specs merged and one full day shows no same-minute contention for those families.

2. Owner: Data pipeline engineer
- Action: enforce single-writer ownership per key family (GHA or worker, not both) for 7 duplicated pairs above.
- Done when: ownership matrix is explicit and the non-owner writer path is disabled.

3. Owner: Release SRE
- Action: keep live Actions visibility check active (public API fallback if `gh` auth fails) and attach run-id evidence in release notes.
- Done when: each release heartbeat includes current run-state evidence for critical workflows.

4. Owner: CTO
- Action: approve canonical owner for each duplicated key family and escalation policy when overlap recurs.
- Done when: owner decisions are documented in `docs/ENGINE.md` and linked from forensic index.
