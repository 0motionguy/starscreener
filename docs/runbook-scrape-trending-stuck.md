# Runbook: scrape-trending stuck

Last updated: 2026-05-04
Owner: Release SRE

## Scope
Incident response when `.github/workflows/scrape-trending.yml` (workflow name: `Refresh fast discovery`) is stuck/failing and trending-derived surfaces go stale.

## Blast radius
When this lane is unhealthy, these surfaces degrade or go stale:
- `/`
- `/breakouts`
- `/top`
- `/predict`
- `/agent-repos`
- `/mindshare`
- `/categories/*`
- `/u/[handle]`
- `/search`
- `/repo/[owner]/[name]`
- `/hackernews/trending` and `/reddit/trending` sidecar freshness may degrade together

Primary producers in this lane:
- `node scripts/scrape-trending.mjs --skip-collection-rankings`
- `node scripts/discover-recent-repos.mjs`
- `node scripts/scrape-reddit.mjs`
- `node scripts/scrape-hackernews.mjs`
- `node scripts/fetch-repo-metadata.mjs`
- `node scripts/compute-deltas.mjs`
- `node scripts/snapshot-stars.mjs` (`continue-on-error`)
- `node scripts/snapshot-category-metrics.mjs` (`continue-on-error`)

## Trigger conditions
Declare incident if either condition is true:
- 2 consecutive scheduled failures of `Refresh fast discovery`
- `npm run freshness:check` reports `trending` (or dependent blocking keys) as non-green

Current known local signal (2026-05-04):
- `npm run freshness:check` reached `http://localhost:3023` (localhost not missing) but failed with `GET /api/cron/freshness/state -> HTTP 500`.

## Triage checklist (5-10 min)
1. Verify freshness gate state:
```bash
npm run freshness:check
```
2. Inspect latest workflow runs (requires GitHub auth):
```bash
gh run list --workflow scrape-trending.yml --limit 7 --json databaseId,status,conclusion,createdAt,updatedAt,headSha,url
```
3. If latest run is failed, inspect failed steps:
```bash
gh run view <run-id> --log-failed
```
4. Check companion workflow for collection rankings split-lane:
```bash
gh run list --workflow refresh-collection-rankings.yml --limit 5 --json databaseId,status,conclusion,createdAt,updatedAt,headSha,url
```
5. Distinguish stale deploy vs collector failure:
- If Vercel deploy is current but this workflow is red, treat as collector/runtime failure.
- If deploy is stale and workflow is green, treat as deploy-path stale artifact issue.

## Decision tree
- `npm ci` / lockfile failure in workflow logs:
  - Fix lockfile drift on `main` and rerun workflow.
- Upstream API failure (`api.ossinsight.io`, Reddit, HN):
  - Re-run once; if repeatable, keep incident open and degrade dependent freshness severity.
- Commit/push failure in `Commit if changed` step:
  - Resolve rebase/conflict path; rerun workflow.
- Only snapshot steps failing (`snapshot-stars`, `snapshot-category-metrics`):
  - Workflow may still complete; treat as degraded deltas/category windows, not full scrape outage.

## Recovery actions
1. Re-run workflow manually:
```bash
gh workflow run scrape-trending.yml --ref main
gh run watch
```
2. If stuck due to transient API/network, retry once.
3. If deterministic code/config failure, patch in scoped PR and merge.
4. Confirm one successful scheduled or manual run after fix.
5. Re-run freshness check and verify blocking rows recover:
```bash
npm run freshness:check
```

## Rollback path
Use when a recent merge is the likely cause and fast restore is needed.
1. Identify last known good SHA from successful `scrape-trending` run.
2. Revert offending commit(s) on a hotfix branch.
3. Merge hotfix and rerun `scrape-trending.yml`.
4. Verify:
- workflow green
- freshness gate no longer blocks on trending-dependent keys
- production pages render fresh trending-derived data

## Verification evidence to capture
- `gh run list` output for latest 5-7 runs
- `gh run view <run-id> --log-failed` snippet for failing step
- `npm run freshness:check` before and after recovery
- exact SHA that restored green state

## Escalation
Escalate to CTO immediately when:
- GitHub auth is missing (`gh` returns 401) and live workflow state cannot be inspected
- Vercel or Railway credentials are missing for deploy/runtime validation
- Branch protection/permissions block required fix or rollback

## Notes
- `scrape-trending.yml` uses `concurrency.group: data-refresh` with `cancel-in-progress: false`; backlog can form instead of cancellation during degraded periods.
- `refresh-collection-rankings.yml` shares this lane and can serialize with `scrape-trending.yml`.
- Keep scope in this runbook to release/ops response only.
