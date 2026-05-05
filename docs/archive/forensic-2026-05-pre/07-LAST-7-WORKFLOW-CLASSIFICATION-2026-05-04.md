# Last-7 Workflow Classification for Blocking Freshness Keys (2026-05-05 refresh)

Source of truth: live GitHub Actions run metadata + failed-step logs captured in this heartbeat.

Capture window (UTC): 2026-05-04T18:40Z to 2026-05-04T18:48Z.

Commands:
- `npm run freshness:check`
- `gh run list --workflow scrape-trending.yml --limit 7 --json ...`
- `gh run list --workflow scrape-devto.yml --limit 7 --json ...`
- `gh run list --workflow collect-twitter.yml --limit 7 --json ...`
- `gh run list --workflow cron-freshness-check.yml --limit 7 --json ...`
- `gh run list --workflow health-watch.yml --limit 7 --json ...`
- `gh run view 25349394588 --log-failed`
- `gh run view 25339835474 --log-failed`
- `gh run view 25345476405 --log-failed`
- `gh run view 25349814827 --log-failed`
- `gh run view 25349658125 --log-failed`

Auth note:
- `gh` defaulted to an invalid `GITHUB_TOKEN` env var (`401`), so evidence commands were run with `GITHUB_TOKEN`/`GH_TOKEN` unset in-process to use the keyring account.

## Freshness baseline at capture

Local `freshness:check` in this heartbeat:
- `freshness-check: local server not reachable at http://localhost:3023 (ECONNREFUSED)`
- Classification: localhost is missing; product freshness preflight is blocked locally.

## Taxonomy buckets

- `PROTECTED_BRANCH_PUSH_REJECTED`: producer steps run, then workflow fails trying to push directly to protected `main` (`GH006`).
- `SOURCE_STALENESS_OR_EMPTY`: source-health checks fail due to stale thresholds or empty-result gates.
- `WORKFLOW_HEALTHY`: workflow concluded success.

## Last-7 classification by workflow

### 1) `scrape-trending.yml` (`Refresh fast discovery`)
Maps to blocking keys: `trending-repos`, `star-snapshots`, `category-metrics` (and contributes to `reddit`).

- Last-7: 0 success, 7 failure.
- Latest failure: [25349394588](https://github.com/0motionguy/starscreener/actions/runs/25349394588) at `2026-05-04T23:34:51Z`.
- Bucket: `PROTECTED_BRANCH_PUSH_REJECTED`.
- Repeating failure signature:
  - `git add` includes ignored path `.data/trending-dual-write-trace.jsonl` -> add failure.
  - push path then blocked by `GH006: Protected branch update failed for refs/heads/main` / `Changes must be made through a pull request`.
- Owning module/team: `.github/actions/git-commit-data` + `.github/workflows/scrape-trending.yml` (Release SRE / Platform).

### 2) `scrape-devto.yml` (`Refresh dev.to signals`)

- Last-7: 5 success, 2 failure.
- Latest failure: [25339835474](https://github.com/0motionguy/starscreener/actions/runs/25339835474) at `2026-05-04T19:47:29Z`.
- Bucket: `PROTECTED_BRANCH_PUSH_REJECTED`.
- Repeating failure signature:
  - scrape and writes complete (`wrote .../data/devto-mentions.json`, `.../data/devto-trending.json`).
  - commit/push step fails with `GH006` protected `main` rejection after retry loop.
- Owning module/team: `.github/actions/git-commit-data` + `.github/workflows/scrape-devto.yml` (Release SRE / Platform).

### 3) `collect-twitter.yml` (`Collect Twitter Signals`)

- Last-7: 1 success, 6 failure.
- Latest failure: [25345476405](https://github.com/0motionguy/starscreener/actions/runs/25345476405) at `2026-05-04T21:51:20Z`.
- Bucket: `PROTECTED_BRANCH_PUSH_REJECTED`.
- Repeating failure signature:
  - collector run completes (`FLUSH SUMMARY repoSignals=25 scans=25 posts=4`).
  - warning: Redis write skipped (`REDIS_URL not set ... skipping Redis write`).
  - final failure at commit/push stage with `GH006` protected `main` rejection after retry loop.
- Owning module/team:
  - Workflow/push failure: `.github/actions/git-commit-data` + `.github/workflows/collect-twitter.yml` (Release SRE / Platform).
  - Redis env provisioning drift (`REDIS_URL` missing in workflow env): Platform/Secrets owner.

### 4) `cron-freshness-check.yml` (`Cron - freshness check`)

- Last-7: 1 success, 6 failure.
- Latest failure: [25349814827](https://github.com/0motionguy/starscreener/actions/runs/25349814827) at `2026-05-04T23:47:08Z`.
- Bucket: `PROTECTED_BRANCH_PUSH_REJECTED`.
- Repeating failure signature:
  - persist-status step commits `data/.cron-health-status`.
  - push blocked by `GH006` protected `main` policy and required status checks.
- Owning module/team: `.github/actions/git-commit-data` + `.github/workflows/cron-freshness-check.yml` (Release SRE / Platform).

### 5) `health-watch.yml` (`Source health watch`)

- Last-7: 0 success, 7 failure.
- Latest failure: [25349658125](https://github.com/0motionguy/starscreener/actions/runs/25349658125) at `2026-05-04T23:42:39Z`.
- Bucket: `SOURCE_STALENESS_OR_EMPTY`.
- Repeating failure signature:
  - `node scripts/check-source-health.mjs` reports many stale sources over budget (`arxiv`, `bluesky`, `hackernews`, `huggingface*`, `lobsters`, `npm`, `producthunt`, `reddit`, `trending`, etc.).
  - explicit quality gate still present: `twitter | FAIL | ... | empty_results`.
- Owning module/team: `scripts/check-source-health.mjs` + source collectors and freshness budgets (Data Pipeline + Release SRE).

## Release-SRE interpretation

- This refresh shows a distinct failure mode shift versus the prior 2026-05-04 report: failures are now dominated by protected-branch push strategy conflicts (`GH006`) rather than only source fetch drift.
- Blast-radius priority:
  1. `scrape-trending` (7/7 failures) affects core keys (`trending-repos`, `star-snapshots`, `category-metrics`).
  2. `health-watch` (7/7 failures) keeps freshness guard red with many stale sources.
  3. `collect-twitter` and `cron-freshness-check` fail mostly post-producer at push stage.
- Local release verification remains blocked because localhost:3023 is currently missing (`ECONNREFUSED`), so local freshness gate cannot validate.
