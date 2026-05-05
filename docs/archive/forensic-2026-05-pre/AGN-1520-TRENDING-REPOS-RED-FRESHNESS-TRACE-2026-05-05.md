# AGN-1520 trending-repos RED freshness trace (2026-05-05)

Timestamp (UTC): 2026-05-05T01:31:05Z

## Mandatory opening + gate result

- Re-read required files:
  - `CLAUDE.md`
  - `docs/ENGINE.md`
  - `docs/SITE-WIREMAP.md`
  - `docs/AUDIT-2026-05-04.md`
  - `docs/forensic/00-INDEX.md`
  - `tasks/CURRENT-SPRINT.md`
  - `tasks/BACKLOG.md`
- Ran: `npm run freshness:check`
- Result:
  - localhost is reachable (not missing).
  - freshness endpoint failed: `GET http://localhost:3023/api/cron/freshness/state -> HTTP 500 Internal Server Error`.

## RED classification proof for `trending-repos`

1. Budget and classifier source of truth
   - `src/app/api/cron/freshness/state/route.ts`
   - `trending-repos` budget is `6h` (`SOURCE_SPECS`, `name: "trending-repos"`).
   - Status thresholds (`classify`):
     - `YELLOW` when `ageMs > budget`.
     - `RED` when `ageMs > budget * 2`.
     - `DEAD` when `ageMs > budget + 24h`.

2. Current measured age
   - `data/_meta/trending.json`:
     - `ts = 2026-05-04T08:06:14.928Z`
   - Measurement timestamp:
     - `now = 2026-05-05T01:31:05.2469893Z`
   - Computed age:
     - `17.41h`
   - Since `17.41h > 12h (2 * 6h)` and `< 30h (6h + 24h)`, status is **RED** by route logic.

3. Payload corroboration
   - `data/trending.json`:
     - `fetchedAt = 2026-05-04T04:13:49.436Z`
     - age at measurement: `21.29h`
   - Confirms stale trending payload on file side as well.

## Failure provenance linked to collector lane

- Prior verified workflow packet: `docs/forensic/AGN-1350-LAST-7-WORKFLOW-CLASSIFICATION-REFRESH-2026-05-05.md`
  - `scrape-trending.yml` last-7 pattern: `F F F F F F F` (7/7 failures).
  - Reported dominant failure signature: protected-branch push rejection (`GH006`), so workflow run completes data generation path then fails publish/push path.
  - This lane maps directly to `trending-repos` backing data (`trending`, `trending-lite`) and high-blast-radius derived surfaces.

## Current blocker state for AGN-1520

- Blocked on two concrete items:
  1. `/api/cron/freshness/state` returning HTTP 500 locally (health inventory route degraded).
  2. `scrape-trending.yml` publish path instability (7/7 failure streak in latest forensic classification).

Needs:
- Platform/Release SRE owner to restore successful freshness-state route behavior.
- Workflow owner to resolve protected-branch publish strategy mismatch for collector workflows that write freshness artifacts.
