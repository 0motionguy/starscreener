# AGN-603 Cron Overlap and Duplicate Effort Audit (2026-05-04)

Issue: AGN-603  
Owner lane: Release SRE

## Heartbeat context

This heartbeat retried after board comment: "Re-queue: bumped concurrency to 5, retry now."

## Live verification attempts (retry sequence)

Initial retries in this issue returned:
- `npm run freshness:check` -> timeout contacting `http://localhost:3023`
- `gh workflow list --limit 200` -> `HTTP 401 Bad credentials`
- `gh run list --limit 120 --json ...` -> `HTTP 401 Bad credentials`

Root cause found:
- `gh auth status` showed shell `GITHUB_TOKEN` is invalid and was overriding auth for API calls.
- Running `gh` commands with process-local override (`$env:GITHUB_TOKEN=$null`) restored live workflow visibility.

Round-2 live state (with `GITHUB_TOKEN` unset in-process):
- `gh workflow list --limit 200` -> success (workflow registry readable)
- `gh run list --limit 120 --json ...` -> success (recent run outcomes readable)
- `npm run freshness:check` -> still timed out on `http://localhost:3023`

## Workflow-file evidence used

- `rg -n "cron:" .github/workflows -g "*.yml"`
- `rg -n "scrape-trending\\.mjs|audit-freshness\\.mjs|check-freshness|freshness/state|--only-collection-rankings|--skip-collection-rankings" .github/workflows -g "*.yml"`

## Quantified overlap windows (by minute field expansion)

Top minute collisions from `.github/workflows/*.yml` cron expressions:

- Minute `0`: 16 jobs
- Minute `30`: 8 jobs
- Minute `17`: 6 jobs
- Minute `15`: 5 jobs
- Minute `45`: 4 jobs
- Minutes `47`, `13`, `25`, `55`, `27`, `20`, `5`, `35`: 3 jobs each

Interpretation: although earlier `:00` burst staggering was applied, `:00` remains the highest collision window due to multiple daily/hourly jobs plus interval workflows.

## Duplicate-effort findings

1. Shared script split into two workflows (same data domain):
- `.github/workflows/scrape-trending.yml` runs:
  - `node scripts/scrape-trending.mjs --skip-collection-rankings`
- `.github/workflows/refresh-collection-rankings.yml` runs:
  - `node scripts/scrape-trending.mjs --only-collection-rankings`

Risk note: separate schedules and run lanes can drift in freshness and failure visibility while still spending duplicate checkout/install/runtime overhead.

2. Freshness checks on overlapping schedules:
- `.github/workflows/cron-freshness-check.yml` at `*/15`
- `.github/workflows/audit-freshness.yml` at `8 * * * *`

Risk note: two freshness monitors are valid for depth, but they can generate overlapping signal/noise during upstream incidents.

## Live run stream snapshot (from `gh run list` after auth fix)

Recent run sample showed mixed health, not globally green:
- `Cron - freshness check`: latest run in progress; prior run failures present.
- `Audit - source freshness`: recent failures.
- `Refresh fast discovery`: recent failures.
- `Refresh collection rankings`: recent failures.
- `Refresh Bluesky signals`: recent failures.
- `Source health watch`: recent failures.

Interpretation: overlap and duplicate-effort risks are still relevant under current failure conditions; consolidation should wait for one stable window first.

## Consolidation candidates (with risk notes)

1. Candidate: fold collection-ranking refresh into `scrape-trending.yml` and retire standalone `refresh-collection-rankings.yml`.
- Benefit: remove one duplicate workflow lane for the same script/domain.
- Risk: larger blast radius if unified job fails; must keep separate step-level failure telemetry.

2. Candidate: align freshness checks into a primary gate + secondary diagnostic.
- Benefit: clearer alert ownership and less duplicate failure chatter.
- Risk: reduced redundancy if primary gate has auth/config drift.

3. Candidate: remove shell-level `GITHUB_TOKEN` override from SRE runbooks for `gh` diagnostics.
- Benefit: prevents false 401 signals when keyring auth is valid.
- Risk: none to product runtime; this affects only operator diagnostic workflows.

## Rollback readiness

Workflow-level rollback path remains file-based:
- Revert cron line changes in `.github/workflows/*.yml`
- Trigger `workflow_dispatch` smoke runs for touched workflows
- Confirm freshness via `npm run freshness:check` and GitHub run conclusions (when auth is available)

## Blockers (explicit)

- Blocked on: GitHub credential path for `gh` in this runtime (`HTTP 401`).
- Needs: CTO/Platform to restore valid GitHub auth for live workflow/run inspection.
- Blocked on: local freshness endpoint timeout on `localhost:3023`.
- Needs: Platform engineer to restore local app/freshness path so `npm run freshness:check` can complete.
- Blocked on: workspace `npm run typecheck` is currently failing on unrelated existing TypeScript errors, so CTO sweep binary check is not clean in this workspace snapshot.
