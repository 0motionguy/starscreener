# Redis Full / Write Failure Runbook

Target MTTR: <= 30 minutes

## Symptoms
- Freshness surfaces degrade while app still serves data (fallback behavior).
- `/api/health?soft=1` shows degraded/stale source state.
- Collector logs show Redis write skips/failures and fallback to bundled JSON/memory tier.

## Diagnosis
1. Check worker health:
   - `https://trendingrepo-worker-production.up.railway.app/healthz`
2. Check freshness state:
   - `/api/cron/freshness/state`
3. Confirm write-path errors in collector/workflow logs:
   - Redis URL missing, write exceptions, or timeout/oom signals.

## Mitigation (30-min path)
1. Run TTL/cleanup sweep for stale keys and large transient sets.
2. If still under pressure, scale Redis plan/tier immediately.
3. Re-run one high-signal collector (`scrape-trending` or `collect-twitter`) and verify meta timestamp advances.
4. Validate recovery on `/api/health?soft=1` and freshness endpoint.

## Real Example (Past Quarter)
- 2026-05-01 to 2026-05-04: audit documented dual-writer/fallback drift and Redis metadata visibility gaps during failed workflow windows. See `docs/AUDIT-2026-05-04.md` sections on freshness drift and writer provenance.

## Rollback
- If cleanup script worsens key health, stop cleanup job, restore prior Redis backup snapshot (or promote previous instance), and route reads to last-known-good fallback until Redis is stable.
