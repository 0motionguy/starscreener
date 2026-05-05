# Last-7 Workflow Classification for Blocking Freshness Keys (2026-05-04 refresh)

Source of truth: live GitHub Actions run metadata + failed-step logs captured in this heartbeat.

Capture window (UTC): 2026-05-04T12:04Z to 2026-05-04T12:17Z.

Commands:
- `gh run list --workflow scrape-trending.yml --limit 7 --json ...`
- `gh run list --workflow cron-freshness-check.yml --limit 7 --json ...`
- `gh run list --workflow health-watch.yml --limit 7 --json ...`
- `gh run list --workflow audit-freshness.yml --limit 7 --json ...`
- `gh run list --workflow refresh-collection-rankings.yml --limit 7 --json ...`
- `gh run view 25314259155 --log-failed`
- `gh run view 25307217625 --log-failed`
- `gh run view 25313997370 --log-failed`
- `gh run view 25317148342 --log-failed`
- `npm run freshness:check`

## Freshness baseline at capture

Local `freshness:check` in this heartbeat fails at preflight health endpoint:
- `GET http://localhost:3023/api/health?soft=1 -> HTTP 500 Internal Server Error`
- Classification: localhost is reachable (not missing), but product is stale/degraded.

## Taxonomy buckets

- `INSTALL_LOCKFILE_DRIFT`: workflow fails at `npm ci` before producer steps.
- `HEALTH_GATE_STALE`: workflow intentionally fails because health/freshness status is stale.
- `SOURCE_STALENESS_OR_EMPTY`: source-health/freshness probes fail on stale windows, fetch failures, or empty results.
- `WORKFLOW_HEALTHY`: workflow concluded success.

## Last-7 classification by workflow

### 1) `scrape-trending.yml` (`Refresh fast discovery`)
Maps to blocking keys: `trending-repos`, `star-snapshots`, `category-metrics` (and contributes to `reddit`).

- Last-7: 6 success, 1 failure.
- Latest failure: [25314259155](https://github.com/0motionguy/starscreener/actions/runs/25314259155) at `2026-05-04T10:35:41Z`.
- Bucket: `INSTALL_LOCKFILE_DRIFT`.
- Failed-log signature:
  - `npm ci` lock mismatch (`happy-dom@20.9.0` vs `happy-dom@15.11.7`).

### 2) `cron-freshness-check.yml` (`Cron - freshness check`)
Gate workflow for stale health status.

- Last-7: 3 success, 4 failure.
- Latest failure: [25307217625](https://github.com/0motionguy/starscreener/actions/runs/25307217625) at `2026-05-04T07:45:27Z`.
- Bucket: `HEALTH_GATE_STALE`.
- Failed-log signature:
  - `health status is 'stale' (expected 'ok')`.

### 3) `health-watch.yml` (`Source health watch`)
Monitors source-level freshness and fetch viability.

- Last-7: 6 success, 1 failure.
- Latest failure: [25313997370](https://github.com/0motionguy/starscreener/actions/runs/25313997370) at `2026-05-04T10:29:16Z`.
- Bucket: `SOURCE_STALENESS_OR_EMPTY`.
- Failed-log signatures:
  - stale thresholds breached: `bluesky`, `devto`, `hackernews`, `lobsters`
  - fetch path issue: `reddit network_error: every subreddit fetch failed`
  - quality gate: `twitter empty_results`

### 4) `audit-freshness.yml` (`Audit - source freshness`)
Freshness gate over `data/_meta/*.json` budgets.

- Last-7: 6 success, 1 failure.
- Latest failure: [25317148342](https://github.com/0motionguy/starscreener/actions/runs/25317148342) at `2026-05-04T11:46:15Z`.
- Bucket: `SOURCE_STALENESS_OR_EMPTY`.
- Failed-log signature:
  - `FAIL — 5 violation(s): bluesky, devto, hackernews, lobsters, reddit`.

### 5) `refresh-collection-rankings.yml` (`Refresh collection rankings`)

- Last-7: 7 success, 0 failure.
- Bucket: `WORKFLOW_HEALTHY`.

## Release-SRE interpretation

- Current degradation is not an all-workflow outage; failures cluster into four concrete modes above.
- `scrape-trending` remains highest blast-radius when install-stage lock drift appears because one run gates multiple blocking keys.
- `cron-freshness-check` failures are detection outcomes, not root cause.
- `audit-freshness` regressed from previously healthy to failing in this capture due to five stale source budgets.
- Local release verification remains blocked until `/api/health?soft=1` is restored from HTTP 500 to HTTP 200.
