# AGN-296 QA Freshness Repro Packet (Dead-Source Focus)

Date (UTC): 2026-05-04
Issue: AGN-296
Scope: read-only QA reproducibility check for freshness gate non-green rows.

## Commands

1. `npm run freshness:check -- --json` (run 1)
2. `curl http://localhost:3023/api/cron/freshness/state` with `Authorization: Bearer $CRON_SECRET` (run 1 probe)
3. Waited 10 minutes 36 seconds
4. `npm run freshness:check -- --json` (run 2)
5. `curl http://localhost:3023/api/cron/freshness/state` with `Authorization: Bearer $CRON_SECRET` (run 2 probe)

Captured artifacts:
- `qa-freshness-run1-20260504T134548Z.json`
- `qa-freshness-probe-run1.json`
- `qa-freshness-run2-20260504T135625Z.json`
- `qa-freshness-probe-run2.json`

## Reachability vs Staleness

| Run | Checked At (UTC) | Localhost Reachable | Health | Source Status | Summary |
|---|---|---|---|---|---|
| Run 1 | 2026-05-04T13:45:50.106Z | Yes (probe HTTP 200) | ok | ok | green=47 yellow=2 red=0 dead=1 blocking_non_green=2 advisory_non_green=1 |
| Run 2 | 2026-05-04T13:56:26.732Z | Yes (probe HTTP 200) | stale | degraded | green=47 yellow=2 red=0 dead=1 blocking_non_green=2 advisory_non_green=1 |

QA verdict: localhost is not missing; gate failures are freshness/staleness classification, not endpoint reachability.

## Before/After Non-Green Delta

| Source | Run 1 | Run 2 | Transition |
|---|---|---|---|
| npm (blocking) | YELLOW, last=2026-05-03T12:55:32.476Z, budget=24h | YELLOW, same last update | No change |
| producthunt (blocking) | YELLOW, last=2026-05-03T23:55:30.517Z, budget=12h | YELLOW, same last update | No change |
| model-usage (advisory) | DEAD, last=2026-05-04T05:44:17.701Z, budget=36h | DEAD, same last update | No change |

Dead-source focus status update vs earlier heartbeat:
- `category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos` were previously blocking DEAD/stale but are GREEN in both reproducibility runs here.
- Current blocker set is now blocking YELLOW (`npm`, `producthunt`) plus advisory DEAD (`model-usage`).

## Owner-Mapped Unblock Actions

| Owner Role | Action | Done When |
|---|---|---|
| Data Pipeline | Refresh `npm` writer path so `npm` key updates inside 24h budget. | Freshness row `npm` turns GREEN for two consecutive checks at least 10 minutes apart. |
| Data Pipeline | Refresh `producthunt` writer path so `producthunt` key updates inside 12h budget. | Freshness row `producthunt` turns GREEN for two consecutive checks at least 10 minutes apart. |
| Platform | Keep local freshness endpoint auth behavior documented (`CRON_SECRET` required for direct probe) and verify script/probe parity stays stable. | `npm run freshness:check -- --json` and authenticated curl probe both return consistent source status in one heartbeat. |
| SRE/Platform | Maintain workflow observability for source update cadence (especially `npm` and `producthunt`) to prevent recurring yellow drift. | Corresponding workflow runs complete and freshness timestamps advance inside budget windows. |

## Residual Risk

- Blocking non-green remains `2`, so freshness gate is still failing for release readiness in this heartbeat.
- Advisory `model-usage` remains DEAD and may hide model telemetry regressions even though it is non-blocking.
