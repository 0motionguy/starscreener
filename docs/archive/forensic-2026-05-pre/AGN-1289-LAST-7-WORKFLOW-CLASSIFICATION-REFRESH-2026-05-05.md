# AGN-1289 Last-7 workflow health classification refresh (2026-05-05)

Timestamp (Asia/Makassar): 2026-05-05T09:15:00+08:00

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
  - `localhost:3023` reachable (not missing), but stale/degraded.
  - Summary: `green=21 yellow=11 red=2 dead=16 blocking_non_green=24 advisory_non_green=5`, `Sentry: MISSING`.

## Live evidence method

- GitHub Actions last-7 runs were pulled live with:
  - `gh run list --workflow <file> --limit 7 --json databaseId,conclusion,status,workflowName,createdAt,url`
- Failure signatures were sampled with:
  - `gh run view <run-id> --log-failed`
- Runtime auth note:
  - `GITHUB_TOKEN` in env was invalid; switching to the logged-in `gh` account token restored access for this heartbeat.

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

## Recurring root-cause buckets (live log signatures)

### Bucket A - Branch protection vs direct push strategy (dominant)

Affected latest failing runs include:
- `25349814827` (`cron-freshness-check.yml`)
- `25340207526` (`refresh-collection-rankings.yml`)
- `25339835474` (`scrape-devto.yml`)
- `25345476405` (`collect-twitter.yml`)

Observed signatures:
- `GH006: Protected branch update failed for refs/heads/main`
- `Changes must be made through a pull request`
- `Required status check "Typecheck, guards, tests, build, e2e" is expected`
- `push failed after 6 attempts`

### Bucket B - Freshness policy gate failing from stale-source budget overruns

Affected latest failing run:
- `25350311352` (`audit-freshness.yml`)

Observed signatures:
- `FAIL — 10 violation(s)`
- Sources repeatedly over budget include `awesome-skills`, `bluesky`, `claude-rss`, `hackernews`, `npm`, `openai-rss`, `producthunt`, `reddit`, `trending`, `twitter`.

### Bucket C - Health-watch threshold gate failing on unhealthy source count

Affected latest failing run:
- `25349658125` (`health-watch.yml`)

Observed signature:
- `[health-watch] 16 source(s) unhealthy of 17 checked. Failing workflow.`

### Bucket D - Snapshot lane instability (non-push failure)

Affected run sample:
- `25266585515` (`snapshot-consensus.yml`)

Observed signature:
- `Process completed with exit code 1` (capture step).
- Root cause requires deeper per-step log instrumentation; failure pattern is intermittent (2 success, then 3 failures, then 1 cancelled in last-6 observed).

## Blocked-vs-actionable split

### Blocked (external decision/permission path)

1. Branch-protection-compatible write path for cron workflows
- Blocked on: repo policy/maintainer decision for bot write strategy (`main` direct push is rejected).
- Needs: CTO/repo admin decision and implementation path (bot branch + PR + merge flow, or approved protected-write exception).

2. Sentry readiness for Sprint 1 closure signals
- Blocked on: `SENTRY_DSN` still missing in freshness outputs.
- Needs: CTO/platform sets `SENTRY_DSN` in Vercel Production and verifies canary.

### Actionable now (engineering execution)

1. Update failing cron workflows to PR-based persistence instead of direct `main` push.
2. Recalibrate freshness budgets or restore stale source pipelines to within existing budgets.
3. Investigate `snapshot-consensus.yml` capture-step failure with expanded failure log capture.

## Follow-up issue links (existing)

- `AGN-172` - Sprint 1 scope guardrail and unblock policy parent.
- `AGN-1290` - Cron overlap and duplicate writer risk refresh.
- `AGN-1351` - Cron overlap and duplicate-writer risk refresh.
- `AGN-1208` - Cron overlap and duplicate-writer risk sweep.

These are the current nearest issue anchors for implementing the workflow write-path and stale-source remediation decisions identified above.
