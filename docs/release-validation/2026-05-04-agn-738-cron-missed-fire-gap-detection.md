---
status: archive
audit-date: 2026-05-05
reason: dated release-validation heartbeat artifact
---

# AGN-738 Cron missed-fire recovery (gap detection)

Date: 2026-05-04
Owner: Release SRE

## Mandatory opening evidence
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran: `npm run freshness:check`.
- Result: fail with `GET http://localhost:3023/api/health?soft=1 -> HTTP 500`.
- Classification: localhost `:3023` reachable (not missing); product stale/degraded.

## Deploy-impact change
- Updated workflow: `.github/workflows/sre-actions-visibility.yml`.
- Added AGN-738 watchdog step `Detect missed-fire gaps (cron watchdog)`.
- Added hard-fail step `Fail on missed-fire gap` when any watched workflow exceeds max age.
- Added artifact output `gap-report.json` and summary table in Actions step summary.

### Gap thresholds (minutes)
- `.github/workflows/cron-freshness-check.yml`: 30
- `.github/workflows/health-watch.yml`: 60
- `.github/workflows/scrape-trending.yml`: 90
- `.github/workflows/collect-twitter.yml`: 240
- `.github/workflows/scrape-devto.yml`: 420

## Why this closes AGN-738
- Previous SRE visibility workflow was snapshot-only and never failed on schedule drift.
- New logic enforces explicit max-gap windows and fails the workflow for `missing_run` or `gap_exceeded` states.
- This distinguishes "workflow did not fire" from "workflow fired but business logic failed" by checking run recency at the Actions layer.

## Rollback path
1. Revert `.github/workflows/sre-actions-visibility.yml`.
2. Trigger `workflow_dispatch` for `SRE - Actions Visibility Snapshot` to verify return to snapshot-only behavior.
3. Confirm no unintended red-X from AGN-738 watchdog in the next scheduled run.
