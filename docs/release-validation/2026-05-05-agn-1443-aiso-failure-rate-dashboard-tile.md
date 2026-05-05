# AGN-1443 — AISO scan failure-rate dashboard tile (Release SRE heartbeat)

Date: 2026-05-05  
Issue: `AGN-1443` (`[QUE-50][OPS] AISO scan failure-rate dashboard tile`)  
Owner lane: Release SRE (`.github/workflows/**`, release-validation notes, runbook linkage)

## What shipped in this heartbeat

- Added telemetry emission in `.github/workflows/cron-aiso-drain.yml`:
  - New event: `aiso_cron_drain_run`
  - Properties include:
    - `success_pct`
    - `failed`
    - `error_class` (`none|timeout|rate_limit|auth|runtime|http_*|unknown_non_json`)
    - `retry_depth_bin` (`0|1_5|6_20|21_plus`, derived from queue remainder depth)
    - `drained`, `succeeded`, `remaining`, `duration_ms`, `http_status`, `ok`
- Existing workflow `aiso-self-scan.yml` already emits `aiso_self_scan_triggered` with
  `ok`, `http_status`, `error`, `latency_ms`.

## Dashboard tile query pack (PostHog SQL)

### 1) Success %
```sql
SELECT
  toStartOfHour(timestamp) AS hour,
  avg(toFloat64(properties.success_pct)) AS success_pct_avg
FROM events
WHERE event = 'aiso_cron_drain_run'
GROUP BY hour
ORDER BY hour DESC
```

### 2) Failures by error class
```sql
SELECT
  properties.error_class AS error_class,
  count() AS failures
FROM events
WHERE event = 'aiso_cron_drain_run'
  AND toIntOrZero(properties.failed) > 0
GROUP BY error_class
ORDER BY failures DESC
```

### 3) Retry depth histogram
```sql
SELECT
  properties.retry_depth_bin AS retry_depth_bin,
  count() AS runs
FROM events
WHERE event = 'aiso_cron_drain_run'
GROUP BY retry_depth_bin
ORDER BY retry_depth_bin
```

## Sentry companion panel

Use Sentry Discover with query filter:
- `transaction:/api/cron/aiso-drain` or route tag `route:api:cron:aiso-drain`
- Group by exception type/message to mirror PostHog `error_class`.

## Live evidence and unblock notes

- `gh auth status` initially failed because process env `GITHUB_TOKEN` was invalid.
- Unblock command confirmed:
  - `Remove-Item Env:GITHUB_TOKEN`
  - then `gh auth status` succeeds using keyring account.
- `gh run list --workflow aiso-self-scan.yml --limit 20 --json ...` succeeded after env cleanup.
- `gh run list --workflow cron-aiso-drain.yml ...` intermittently timed out on GitHub API network path in this workspace; telemetry now ships from the workflow itself so dashboard population does not depend on this local polling path.

## Explicit operator action checklist (CTO sweep requirement)

1. Env var hygiene for local ops shell:
   - Remove invalid `GITHUB_TOKEN` override (`Remove-Item Env:GITHUB_TOKEN`) before `gh` ops checks.
2. Dashboard URL to configure:
   - `https://us.posthog.com/project/*/insights` (project that receives existing `uptime_check` events).
3. Commands to verify fresh event ingress:
   - Trigger workflow: `gh workflow run cron-aiso-drain.yml`
   - Check latest run: `gh run list --workflow cron-aiso-drain.yml --limit 5`
4. Decision needed:
   - Confirm whether `retry_depth_bin` derived from `remaining` is accepted for QUE-50, or backend should expose per-row retry attempt depth for a stricter histogram.
