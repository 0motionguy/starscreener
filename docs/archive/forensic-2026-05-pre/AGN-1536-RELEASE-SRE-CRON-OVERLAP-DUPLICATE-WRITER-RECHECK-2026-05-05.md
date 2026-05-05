# AGN-1536 [Sprint 1 audit] Release/SRE cron overlap and duplicate-writer drift recheck (2026-05-05)

## Mandatory opening + freshness preflight
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` at `2026-05-05T09:24:25.7377240+08:00` failed:
  - `freshness-check: GET http://localhost:3023/api/health?soft=1 failed: HTTP 500 Internal Server Error`
  - Verdict: localhost `:3023` is reachable but product health is stale/degraded (not a missing localhost case).

## Live workflow-state verification (required, blocked)
- `gh workflow list --limit 200` failed with:
  - `HTTP 401: Bad credentials`
- `gh run list --limit 80 --json ...` failed with:
  - `HTTP 401: Bad credentials`
- Consequence: live GitHub Actions run-state/conclusion verification is blocked in this heartbeat.

## Cron overlap recheck (current repo workflow schedules)
Evidence command: `rg -n "cron:" .github/workflows -g "*.yml"`

High-contention windows still present:
1. `:17` burst:
   - `scrape-bluesky.yml` (`17 * * * *`)
   - `refresh-collection-rankings.yml` (`17 */6 * * *`)
   - `refresh-star-activity.yml` (`17 3 * * *`)
   - `refresh-reddit-baselines.yml` (`17 3 * * 1`)
   - `sre-route-cost-attribution-verify.yml` (`17 */6 * * *`)
2. `03:xx` dense cluster:
   - `refresh-skill-install-snapshot.yml` (`0 3 * * *`)
   - `refresh-skill-derivatives.yml` (`7 */12 * * *`)
   - `refresh-mcp-smithery-rank.yml` (`11 3 * * *`)
   - `refresh-skill-claude.yml` (`12 3 * * *`)
   - `refresh-skill-forks-snapshot.yml` (`13 3 * * *`)
   - `refresh-star-activity.yml` (`17 3 * * *`)
   - `refresh-hotness-snapshot.yml` (`25 3 * * *`)
   - `refresh-mcp-usage-snapshot.yml` (`30 3 * * *`)
   - `refresh-skill-smithery.yml` (`30 3 * * *`)
3. Shared cadence collisions:
   - `*/15`: `cron-freshness-check.yml` and `sre-actions-visibility.yml`
   - `*/30`: `health-watch.yml` and `sources-auto-recover.yml`

Verdict: overlap windows are still structurally present on the current branch.

## Duplicate-writer drift recheck (GHA + worker overlap still active)
Evidence commands:
- GHA cron definitions: `rg -n "cron:" .github/workflows -g "*.yml"`
- Worker schedules: `rg -n "schedule:" apps/trendingrepo-worker/src -g "*.ts"`

Verified shared key families with active dual writers:
1. `trending`, `trending-lite`
   - GHA: `scrape-trending.yml` -> `scripts/scrape-trending.mjs`
   - Worker: `fetchers/oss-trending` (`schedule: '22 * * * *'`)
2. `collection-rankings`
   - GHA: `refresh-collection-rankings.yml` -> `scripts/scrape-trending.mjs --only-collection-rankings`
   - Worker: `fetchers/collection-rankings` (`schedule: '17 */6 * * *'`)
3. `deltas`
   - GHA: `scrape-trending.yml` -> `scripts/compute-deltas.mjs`
   - Worker: `fetchers/deltas` (`schedule: '40 * * * *'`)
4. `devto-trending`, `devto-mentions`
   - GHA: `scrape-devto.yml` (`18 */6 * * *`)
   - Worker: `fetchers/devto` (`schedule: '30 8 * * *'`)
5. `reddit-all-posts`, `reddit-mentions`
   - GHA lane: `scrape-trending.yml` executes `npm run scrape:reddit`
   - Worker: `fetchers/reddit` (`schedule: '30 * * * *'`)
6. `producthunt-launches`
   - GHA: `scrape-producthunt.yml` (`22 11,15,19,23 * * *`)
   - Worker: `fetchers/producthunt` (`schedule: '0 11,15,19,23 * * *'`)
7. `trustmrr-startups`, `revenue-overlays`
   - GHA: `sync-trustmrr.yml` (`27 * * * *` + daily seed window)
   - Worker: `fetchers/trustmrr` (`schedule: '27 * * * *'`)

Verdict: duplicate-writer drift risk remains unresolved for freshness-critical keys.

## Release/SRE blocker and escalation status
- Blocker 1 (hard): missing/invalid GitHub auth for Actions API (`HTTP 401`) blocks live workflow-state verification.
- Blocker 2: freshness check is non-green due to local product HTTP 500.
- Escalation owner: CTO/platform.
- Needed to unblock:
  1. Provide valid GitHub auth for this runtime (`gh workflow list`/`gh run list` must succeed).
  2. Approve single-writer ownership per shared key family before overlap/cutover edits.
  3. Restore local freshness path so `npm run freshness:check` reaches pass criteria.
