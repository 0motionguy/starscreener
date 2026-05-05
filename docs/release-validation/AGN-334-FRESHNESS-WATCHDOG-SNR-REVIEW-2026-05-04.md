# AGN-334 SRE freshness watchdog signal-to-noise review (2026-05-04)

Timestamp (local): 2026-05-04T19:25:27+08:00
Issue: AGN-334

## Mandatory preflight result
- Command: `npm run freshness:check`
- Result: FAIL
- Evidence: `GET /api/health?soft=1 -> HTTP 500 Internal Server Error`
- Verdict: `localhost:3023` is not missing; it is reachable but product state is stale/degraded.

## Live workflow evidence (last 15 runs each)
- `cron-freshness-check.yml`: 2 success / 13 failure
  - Latest success: https://github.com/0motionguy/starscreener/actions/runs/25313136145
  - Latest failure: https://github.com/0motionguy/starscreener/actions/runs/25307217625
- `audit-freshness.yml`: 15 success / 0 failure
  - Latest success: https://github.com/0motionguy/starscreener/actions/runs/25310989108
- `health-watch.yml`: 14 success / 1 failure
  - Latest failure: https://github.com/0motionguy/starscreener/actions/runs/25313997370

## Signal-to-noise findings
1. `cron-freshness-check` dominates alert volume and is noisy for known stale states.
- It runs every 15 minutes and fail-louds on any non-`ok` status.
- At current failure rate, this can generate repeated red runs for the same unchanged incident.

2. `audit-freshness` currently adds little incremental detection signal.
- It is 15/15 green while `cron-freshness-check` is mostly red.
- It checks committed `data/_meta` files, which may diverge from runtime Redis-backed freshness state.

3. `health-watch` and `audit-freshness` have partial overlap in stale-file detection.
- Both use `data/_meta/*.json` in repo checkout, not live runtime state.
- This can misclassify healthy runtime with stale committed artifacts (or vice versa).

## Proposed SNR adjustments (owned surfaces only)
1. Keep `cron-freshness-check` as the primary paging signal, but page only on state transition.
- Maintain current webhook transition behavior.
- Convert repeated same-state failures to non-failing warnings after first transition until state flips.

2. Reposition `audit-freshness` as trend audit (non-paging).
- Keep hourly execution and log artifact.
- Do not use as primary fail-loud gate while runtime source of truth is Redis.

3. Align `health-watch` data source with runtime freshness state.
- Replace local `_meta` file-only logic with a runtime endpoint check (`/api/cron/freshness/state`) scoped to blocking rows.

## Rollback readiness note
- Any change to fail semantics in watchdog workflows should be revertable by restoring prior YAML for:
  - `.github/workflows/cron-freshness-check.yml`
  - `.github/workflows/audit-freshness.yml`
  - `.github/workflows/health-watch.yml`
- No production codepaths are modified in this heartbeat.

## Release decision for this heartbeat
- Release safety remains BLOCKED by current local preflight failure (`/api/health?soft=1` -> HTTP 500) and high watchdog noise in the 15-minute lane.
