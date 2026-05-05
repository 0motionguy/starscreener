# AGN-1511 [Sprint 1 audit] Release/SRE cron overlap and duplicate-trigger map refresh (2026-05-05)

## Mandatory opening + freshness preflight (this heartbeat)
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` at `2026-05-05T01:18:58.509Z`:
  - localhost target `http://localhost:3023` is reachable (not missing).
  - freshness gate is stale/degraded: `health=stale`, `sourceStatus=ok`.
  - summary: `green=37`, `yellow=11`, `red=2`, `dead=0`, `blocking_non_green=11`, `advisory_non_green=2`.
  - blocking RED sources: `producthunt`, `trending-repos`.

## Live workflow-state verification
- `gh auth status` reports GitHub Actions API auth failure for active env token:
  - `Failed to log in to github.com using token (GITHUB_TOKEN)`
  - `The token in GITHUB_TOKEN is invalid.`
- `gh workflow list --limit 200` and `gh run list --limit 120 ...` both return `HTTP 401: Bad credentials`.
- Consequence: live workflow run-state and conclusion evidence cannot be refreshed in this heartbeat.

## Cron overlap refresh (repo workflow schedules, current branch)
Source command: `rg -n "cron:" .github/workflows -g "*.yml"`

### High-contention windows still present
1. `:17` burst window
- `scrape-bluesky.yml` (`17 * * * *`)
- `refresh-collection-rankings.yml` (`17 */6 * * *`)
- `refresh-star-activity.yml` (`17 3 * * *`)
- `refresh-reddit-baselines.yml` (`17 3 * * 1`)
- `sre-route-cost-attribution-verify.yml` (`17 */6 * * *`)

2. `03:xx` daily cluster
- `refresh-skill-install-snapshot.yml` (`0 3 * * *`)
- `refresh-skill-derivatives.yml` (`7 */12 * * *`)
- `refresh-mcp-smithery-rank.yml` (`11 3 * * *`)
- `refresh-skill-claude.yml` (`12 3 * * *`)
- `refresh-skill-forks-snapshot.yml` (`13 3 * * *`)
- `refresh-star-activity.yml` (`17 3 * * *`)
- `refresh-hotness-snapshot.yml` (`25 3 * * *`)
- `refresh-mcp-usage-snapshot.yml` and `refresh-skill-smithery.yml` (`30 3 * * *`)

3. Shared cadence collisions
- `*/15`: `cron-freshness-check.yml` and `sre-actions-visibility.yml`
- `*/30`: `health-watch.yml` and `sources-auto-recover.yml`
- `23 */6`: `refresh-npm-downloads.yml` and `scrape-awesome-skills.yml` (both can coincide at `23 0/6` windows depending on day/hour alignment)
- `47 */6`: `ping-mcp-liveness.yml` and `scrape-openai-rss.yml` can coincide at `07:47`, `19:47`

## Duplicate-trigger / duplicate-writer map refresh
Verified dual-writer paths remain active (GHA + Railway worker):
1. `trending`, `trending-lite`
- GHA: `scrape-trending.yml` -> `scripts/scrape-trending.mjs`
- Worker: `apps/trendingrepo-worker/src/fetchers/oss-trending/index.ts`

2. `collection-rankings`
- GHA: `refresh-collection-rankings.yml` -> `scripts/scrape-trending.mjs --only-collection-rankings`
- Worker: `apps/trendingrepo-worker/src/fetchers/collection-rankings/index.ts`

3. `deltas`
- GHA: `scrape-trending.yml` -> `scripts/compute-deltas.mjs`
- Worker: `apps/trendingrepo-worker/src/fetchers/deltas/index.ts`

4. `devto-trending`, `devto-mentions`
- GHA: `scrape-devto.yml` -> `scripts/scrape-devto.mjs`
- Worker: `apps/trendingrepo-worker/src/fetchers/devto/index.ts`

5. `reddit-all-posts`, `reddit-mentions`
- GHA lane: `scrape-trending.yml` executes `npm run scrape:reddit`
- Worker: `apps/trendingrepo-worker/src/fetchers/reddit/index.ts`

6. `producthunt-launches`
- GHA: `scrape-producthunt.yml` -> `scripts/scrape-producthunt.mjs`
- Worker: `apps/trendingrepo-worker/src/fetchers/producthunt/index.ts`

7. `trustmrr-startups`, `revenue-overlays`
- GHA: `sync-trustmrr.yml` -> `scripts/sync-trustmrr.mjs`
- Worker: `apps/trendingrepo-worker/src/fetchers/trustmrr/index.ts`

## Drift verdict vs prior overlap packet
- Prior :00 burst mitigation (documented in AGN-448-era notes) is still present (`audit-freshness` at `:08`, `cron-aiso-drain` at `:03/:33`, `scrape-devto` at `:18`, `scrape-producthunt` at `:22`, `sweep-staleness` at `:32`).
- Overlap risk remains in `:17` and dense `03:xx` bands.
- Duplicate-writer risk remains unresolved for freshness-critical keys listed above.

## Release/SRE blocker state and rollback readiness
- Blocker 1: GitHub Actions API auth missing/invalid in this workspace (`GITHUB_TOKEN` invalid), preventing live run-state validation.
- Blocker 2: freshness gate remains non-green (`blocking_non_green=11`).
- Rollback readiness for future cadence/single-writer edits:
  1. revert edited cron lines in `.github/workflows/*.yml`,
  2. run impacted workflows via `workflow_dispatch`,
  3. re-run `npm run freshness:check` and verify `blocking_non_green=0` before declaring done.

## Escalation needed
- Owner: CTO/platform.
- Required unblock actions:
  1. provide valid GitHub Actions auth token for this runtime so `gh workflow list` / `gh run list` can be verified live;
  2. approve single-writer authority per shared key family (`trending`, `collection-rankings`, `deltas`, `devto`, `reddit`, `producthunt`, `trustmrr`) before overlap reduction edits.