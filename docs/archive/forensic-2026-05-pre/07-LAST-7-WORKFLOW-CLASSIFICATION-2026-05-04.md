# Last-7 Workflow Classification for Blocking Freshness Keys (2026-05-05 refresh)

Source of truth: live GitHub Actions run metadata + failed-step logs captured in this heartbeat.

Capture window (UTC): 2026-05-05T07:18Z to 2026-05-05T07:21Z.

Commands:
- `npm run freshness:check`
- `$env:GITHUB_TOKEN=$null; $env:GH_TOKEN=$null; gh run list --workflow scrape-trending.yml --limit 7 --json databaseId,status,conclusion,createdAt,updatedAt,url,workflowName`
- `$env:GITHUB_TOKEN=$null; $env:GH_TOKEN=$null; gh run list --workflow scrape-devto.yml --limit 7 --json databaseId,status,conclusion,createdAt,updatedAt,url,workflowName`
- `$env:GITHUB_TOKEN=$null; $env:GH_TOKEN=$null; gh run list --workflow collect-twitter.yml --limit 7 --json databaseId,status,conclusion,createdAt,updatedAt,url,workflowName`
- `$env:GITHUB_TOKEN=$null; $env:GH_TOKEN=$null; gh run list --workflow cron-freshness-check.yml --limit 7 --json databaseId,status,conclusion,createdAt,updatedAt,url,workflowName`
- `$env:GITHUB_TOKEN=$null; $env:GH_TOKEN=$null; gh run list --workflow health-watch.yml --limit 7 --json databaseId,status,conclusion,createdAt,updatedAt,url,workflowName`
- `$env:GITHUB_TOKEN=$null; $env:GH_TOKEN=$null; gh run view 25361270377 --log-failed`
- `$env:GITHUB_TOKEN=$null; $env:GH_TOKEN=$null; gh run view 25356259575 --log-failed`
- `$env:GITHUB_TOKEN=$null; $env:GH_TOKEN=$null; gh run view 25361274765 --log-failed`
- `$env:GITHUB_TOKEN=$null; $env:GH_TOKEN=$null; gh run view 25354147740 --log-failed`
- `$env:GITHUB_TOKEN=$null; $env:GH_TOKEN=$null; gh run view 25358544157 --log-failed`

Auth note:
- `gh auth status` showed env token override failure when `GITHUB_TOKEN` is present (`invalid token`) but keyring auth is valid.
- All evidence commands were run with `GITHUB_TOKEN` and `GH_TOKEN` unset in-process.

## Freshness baseline at capture

Local `freshness:check` in this heartbeat:
- `GET http://localhost:3023/api/health?soft=1 failed: HTTP 500`
- Classification: localhost is reachable (not missing), but product freshness preflight is stale/degraded.

## Taxonomy buckets

- `PROTECTED_BRANCH_PUSH_REJECTED`: producer steps run, then workflow fails trying to push directly to protected `main` (`GH006`).
- `SOURCE_STALENESS_OR_EMPTY`: source-health checks fail due to stale thresholds or empty-result gates.
- `WORKFLOW_HEALTHY`: workflow concluded success.
- `WORKFLOW_IN_PROGRESS`: latest run still executing; classified from remaining completed runs in the last-7 window.

## Last-7 classification by workflow

### 1) `scrape-trending.yml` (`Refresh fast discovery`)
Maps to blocking keys: `trending-repos`, `star-snapshots`, `category-metrics` (and contributes to `reddit`).

- Last-7 window snapshot: 1 in-progress, 6 completed failures, 0 completed successes.
- Latest completed failure: [25361270377](https://github.com/0motionguy/starscreener/actions/runs/25361270377) at `2026-05-05T06:25:50Z`.
- Latest run still active: [25362621364](https://github.com/0motionguy/starscreener/actions/runs/25362621364) started `2026-05-05T07:04:43Z`.
- Bucket: `PROTECTED_BRANCH_PUSH_REJECTED`.
- Repeating failure signature:
  - `git add` includes ignored path `.data/trending-dual-write-trace.jsonl` -> add failure (run `25361270377`).
  - other recent failures show commit/push path blocked by `GH006` protected `main` rejection.
- Owning module/team: `.github/actions/git-commit-data` + `.github/workflows/scrape-trending.yml` (Release SRE / Platform).

### 2) `scrape-devto.yml` (`Refresh dev.to signals`)

- Last-7: 4 success, 3 failure.
- Latest failure: [25356259575](https://github.com/0motionguy/starscreener/actions/runs/25356259575) at `2026-05-05T03:28:36Z`.
- Bucket: `PROTECTED_BRANCH_PUSH_REJECTED`.
- Repeating failure signature:
  - scrape and writes complete (`wrote .../data/devto-mentions.json`, `.../data/devto-trending.json`).
  - commit/push step fails with `GH006` protected `main` rejection after retry loop.
- Owning module/team: `.github/actions/git-commit-data` + `.github/workflows/scrape-devto.yml` (Release SRE / Platform).

### 3) `collect-twitter.yml` (`Collect Twitter Signals`)

- Last-7: 1 success, 6 failure.
- Latest failure: [25361274765](https://github.com/0motionguy/starscreener/actions/runs/25361274765) at `2026-05-05T06:25:58Z`.
- Bucket: `PROTECTED_BRANCH_PUSH_REJECTED`.
- Repeating failure signature:
  - collector run reaches commit stage and then fails at push with `GH006` protected `main` rejection after retries.
- Owning module/team:
  - Workflow/push failure: `.github/actions/git-commit-data` + `.github/workflows/collect-twitter.yml` (Release SRE / Platform).

### 4) `cron-freshness-check.yml` (`Cron - freshness check`)

- Last-7: 2 success, 5 failure.
- Latest failure: [25354147740](https://github.com/0motionguy/starscreener/actions/runs/25354147740) at `2026-05-05T02:10:33Z`.
- Bucket: `PROTECTED_BRANCH_PUSH_REJECTED`.
- Repeating failure signature:
  - probe reaches status evaluation (`body_status=stale`), writes `data/.cron-health-status`, then push fails with `GH006` protected `main` rejection.
- Owning module/team: `.github/actions/git-commit-data` + `.github/workflows/cron-freshness-check.yml` (Release SRE / Platform).

### 5) `health-watch.yml` (`Source health watch`)

- Last-7: 0 success, 7 failure.
- Latest failure: [25358544157](https://github.com/0motionguy/starscreener/actions/runs/25358544157) at `2026-05-05T04:53:39Z`.
- Bucket: `SOURCE_STALENESS_OR_EMPTY`.
- Repeating failure signature:
  - `node scripts/check-source-health.mjs` reports many stale sources over budget (`arxiv`, `bluesky`, `hackernews`, `huggingface*`, `lobsters`, `npm`, `producthunt`, `reddit`, `trending`, etc.).
  - explicit gate still fails `twitter` as `empty_results`.
- Owning module/team: `scripts/check-source-health.mjs` + source collectors and freshness budgets (Data Pipeline + Release SRE).

## Release-SRE interpretation

- In this refreshed last-7 window, dominant workflow failures remain protected-branch push strategy conflicts (`GH006`) in collector + cron workflows that attempt direct `main` writes.
- Independent of push policy failures, `health-watch` is still a true source-health failure path (7/7 fails) with stale/empty signals.
- Local release verification remains degraded (not localhost-missing): `localhost:3023` responds but `/api/health?soft=1` returns HTTP 500.