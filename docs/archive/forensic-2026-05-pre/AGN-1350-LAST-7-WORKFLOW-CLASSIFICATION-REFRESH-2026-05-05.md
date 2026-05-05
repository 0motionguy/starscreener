# AGN-1350 Last-7 workflow health classification refresh (2026-05-05)

Timestamp (Asia/Makassar): 2026-05-05T09:20:00+08:00

## Mandatory opening + freshness gate

- Required opening files re-read in this heartbeat:
  - `CLAUDE.md`
  - `docs/ENGINE.md`
  - `docs/SITE-WIREMAP.md`
  - `docs/AUDIT-2026-05-04.md`
  - `docs/forensic/00-INDEX.md`
  - `tasks/CURRENT-SPRINT.md`
  - `tasks/BACKLOG.md`
- Freshness command:
  - `npm run freshness:check`
- Freshness result:
  - `localhost:3023` reachable (health endpoint HTTP 200 via direct probe), but product state is stale/degraded.
  - Script summary: `green=37 yellow=11 red=2 dead=0 blocking_non_green=11 advisory_non_green=2`, `Sentry: MISSING`.

## Scope and evidence method

- Source: live GitHub Actions data via `gh run list --workflow <file> --limit 7 --json ...` and failure signatures via `gh run view <run-id> --log-failed`.
- Critical workflow set refreshed:
  - `scrape-trending.yml`
  - `cron-freshness-check.yml`
  - `audit-freshness.yml`
  - `health-watch.yml`
  - `refresh-collection-rankings.yml`
  - `scrape-devto.yml`
  - `collect-twitter.yml`
  - `snapshot-top10.yml`
  - `snapshot-top10-sparklines.yml`
  - `snapshot-consensus.yml`

## Last-7 classification matrix

| Workflow file | Workflow name | Success | Failure | Cancelled | Latest-7 sequence (newest -> oldest) | >=3 consecutive failures? |
|---|---|---:|---:|---:|---|---|
| `scrape-trending.yml` | Refresh fast discovery | 0 | 7 | 0 | F F F F F F F | YES (7) |
| `cron-freshness-check.yml` | Cron - freshness check | 1 | 6 | 0 | F S F F F F F | YES (max 5) |
| `audit-freshness.yml` | Audit - source freshness | 0 | 7 | 0 | F F F F F F F | YES (7) |
| `health-watch.yml` | Source health watch | 0 | 7 | 0 | F F F F F F F | YES (7) |
| `refresh-collection-rankings.yml` | Refresh collection rankings | 5 | 2 | 0 | F F S S S S S | NO |
| `scrape-devto.yml` | Refresh dev.to signals | 5 | 2 | 0 | F F S S S S S | NO |
| `collect-twitter.yml` | Collect Twitter Signals | 1 | 6 | 0 | F S F F F F F | YES (max 5) |
| `snapshot-top10.yml` | Snapshot /top10 daily | 2 | 0 | 5 | S S C C C C C | NO |
| `snapshot-top10-sparklines.yml` | Snapshot /top10 sparklines daily | 2 | 0 | 5 | S S C C C C C | NO |
| `snapshot-consensus.yml` | Snapshot /consensus daily | 2 | 3 | 1 | S S F F F C | YES (3) |

## Failure cluster signatures (live log evidence)

### Cluster A — protected-branch push model mismatch (highest frequency)

Observed in latest failures for:
- `scrape-trending.yml` run `25349394588`
- `cron-freshness-check.yml` run `25349814827`
- `refresh-collection-rankings.yml` run `25340207526`
- `scrape-devto.yml` run `25339835474`
- `collect-twitter.yml` run `25345476405`

Common failing signature:
- Workflow commits on `main`, then push is rejected:
  - `remote: error: GH006: Protected branch update failed for refs/heads/main`
  - `Changes must be made through a pull request`
  - `Required status check "Typecheck, guards, tests, build, e2e" is expected`
- Retry loop exhausts (`push failed after 6 attempts`).

### Cluster B — freshness policy gate failing by stale sources

Observed in latest failure for:
- `audit-freshness.yml` run `25350311352`

Common failing signature:
- `node scripts/audit-freshness.mjs` exits non-zero with stale-budget violations:
  - examples: `producthunt`, `trending`, `twitter`, `reddit`, `bluesky`, `awesome-skills`, `npm`.

### Cluster C — health-watch threshold gate failing by stale source ages

Observed in latest failure for:
- `health-watch.yml` run `25349658125`

Common failing signature:
- `node scripts/check-source-health.mjs` reports many stale sources and fails:
  - `[health-watch] 16 source(s) unhealthy of 17 checked. Failing workflow.`

## Cross-link: failing workflows -> affected surfaces

| Failing workflow | Affected product/ops surfaces |
|---|---|
| `scrape-trending.yml` | `/`, `/breakouts`, `/top`, `/predict`, `/agent-repos`, `/mindshare`, `/categories/*`, `/u/[handle]`, `/search`, `/repo/*` (derived-repos backbone) |
| `collect-twitter.yml` | `/twitter`, repo profile Twitter panel, breakouts `twitter` channel |
| `scrape-devto.yml` | `/devto`, `/signals`, breakouts `devto` channel, repo profile devto synthesis |
| `refresh-collection-rankings.yml` | `/collections`, `/collections/[slug]` |
| `snapshot-consensus.yml` | `/consensus`, `/consensus/[owner]/[name]` |
| `snapshot-top10.yml` + `snapshot-top10-sparklines.yml` | `/top10`, `/top10/[date]`, `/embed/top10` |
| `cron-freshness-check.yml` | freshness state reliability and `/admin/staleness` trust path |
| `audit-freshness.yml` | CI freshness guardrail reliability (release safety signal) |
| `health-watch.yml` | source breaker-state confidence used by ops triage and downstream runbooks |

## Recommended triage ordering

1. **Fix Cluster A first (workflow push model vs branch protection):**
   - Convert data-writing workflows from direct `main` push to bot branch + PR + merge path (or approved protected-write path).
   - This single fix removes repeated false-negative failures across multiple collectors.
2. **Then fix Cluster B/C policy gates:**
   - Re-baseline freshness thresholds to current schedule reality or restore source cadence to budget.
   - Ensure `audit-freshness` and `health-watch` fail only on true incidents, not structural schedule mismatch.
3. **Then clear source-specific functional freshness debt:**
   - Prioritize `trending`, `producthunt`, `twitter`, `reddit`, `bluesky`, `npm`, `awesome-skills` based on stale age and route blast radius.
4. **Finally stabilize snapshot lane:**
   - After push-path and freshness gates are corrected, re-check `snapshot-consensus` (3-failure streak) and cancellation-heavy top10 snapshots.

## Decision outcome for AGN-1350

- This issue is **actionable and executed** in this heartbeat.
- Blocker classification updated from generic to concrete:
  - primary operational blocker is workflow write strategy incompatible with protected-branch policy (GH006), not missing operator context.
