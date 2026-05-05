# AGN-333 verification heartbeat (2026-05-04)

Issue: AGN-333  
Owner lane: Release SRE (cron overlap + duplicate-run risk)

## Mandatory opening evidence

- Read in this heartbeat: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Freshness preflight: `npm run freshness:check` at 2026-05-04 (local run in this heartbeat) returned `GET http://localhost:3023/api/health?soft=1 -> HTTP 500`.
- Interpretation: localhost `3023` is reachable (not missing) but product state is stale/degraded.

## Live workflow evidence captured

- `gh workflow list --limit 200` confirms full active workflow inventory including cron surfaces in SRE scope.
- `gh run list --limit 120 --json workflowName,status,conclusion,createdAt,startedAt,updatedAt,displayTitle,headSha` confirms recent scheduler behavior and failures.
- Schedule/concurrency extraction:
  - `rg -n "^name:|^on:|cron:|concurrency:" .github/workflows -g "*.yml"`
  - `rg -n "concurrency:|group:|cancel-in-progress:" .github/workflows -g "*.yml"`

## Cron overlap + duplicate-run risk conclusions

1. Overlap windows are real and intentional:
- `scrape-trending.yml` (`7,27,47 * * * *`) overlaps minute `:27` with `sync-trustmrr.yml` (`27 ... * * *`) and other routine jobs.
- `03:00-03:30 UTC` is a dense burst for skill/MCP snapshot jobs.

2. Intra-workflow duplicate execution risk is mostly controlled:
- Cron workflows generally define explicit `concurrency.group` values with `cancel-in-progress: false`, which queues rather than duplicates same-workflow runs.
- `scrape-trending.yml` and `refresh-collection-rankings.yml` share `concurrency.group: data-refresh`, serializing those two workflows and preventing concurrent duplicate writes between them.

3. Remaining operational risk is cross-workflow stale-partial state, not same-workflow duplication:
- Recent run stream shows mixed outcomes in overlapping windows (examples: `Refresh npm package telemetry` failure at `2026-05-04T11:18:20Z`, `Collect Twitter Signals` failure at `2026-05-04T10:53:01Z`, while other cron jobs succeed).
- This can leave product freshness degraded even with some green cron checks.

## Rollback readiness (verified path)

- Fast rollback for schedule/concurrency regressions remains: revert affected `.github/workflows/*.yml` cron/concurrency lines on `main`, then run targeted `workflow_dispatch` smoke executions before normal cadence resumes.

## AGN-333 heartbeat outcome

- Scope result: verification complete with live cron/concurrency/run evidence.
- No workflow edits were applied in this heartbeat; risk characterization updated from live state.
