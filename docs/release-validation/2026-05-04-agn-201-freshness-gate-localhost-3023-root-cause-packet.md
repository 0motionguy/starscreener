# AGN-201: Freshness gate 500 on localhost:3023 root-cause packet (2026-05-04)

## Scope
- Issue: `AGN-201`
- Surface: local freshness preflight (`npm run freshness:check`) and supporting routes:
  - `GET /api/health?soft=1`
  - `GET /api/cron/freshness/state`

## Incident statements verified from sprint/backlog records
- `tasks/CURRENT-SPRINT.md` records two regressions on 2026-05-04:
  - `ECONNREFUSED` to `http://localhost:3023` (local server missing).
  - `GET /api/cron/freshness/state -> HTTP 500` while localhost was reachable.
- `scripts/check-freshness.mts` confirms default preflight target is `http://localhost:3023` and calls both routes above.

## Heartbeat evidence captured now
Command:
```powershell
npm run freshness:check
```

Observed at `2026-05-04T16:43:25.278Z` (from command output `checkedAt`):
- Exit code: `0`
- Target: `http://localhost:3023`
- Freshness route reachable: `GET /api/cron/freshness/state` succeeded (table rendered)
- Health route reachable: `health=stale sourceStatus=degraded` returned (non-500)
- Freshness summary: `green=50 yellow=0 red=0 dead=0 blocking_non_green=0 advisory_non_green=0`
- Remaining non-pass signal: `Sentry: MISSING`

Devserver log check (`.tmp-devserver.log`) in this heartbeat also shows:
- `GET /api/health?soft=1 200`
- `GET /api/cron/freshness/state 200`

## Root-cause assessment (current confidence)
1. Earlier `ECONNREFUSED` was caused by local dev server unavailability on port `3023` at that moment.
2. Earlier `HTTP 500` on `/api/cron/freshness/state` is currently transient/non-reproducible; same route returns `200` in this heartbeat under the same local target.
3. Active blocker is not route reachability anymore; it is Sprint 1 Phase 1.5 verification gap (`SENTRY_DSN` missing in runtime, reflected by `Sentry: MISSING`).

## Deployment/rollback readiness notes
- No deploy-sensitive code change was required in this heartbeat to restore local preflight behavior.
- Rollback path for AGN-201 remains operationally simple: if freshness regresses again, restart local app (`npm run dev`) and re-run `npm run freshness:check`; if 500 recurs, capture route stack trace from dev logs and isolate recent changes in:
  - `src/app/api/cron/freshness/state/route.ts`
  - `src/lib/data-store.ts`
  - `src/lib/api/auth.ts`

## Next action
- Keep AGN-201 scoped as "recovered, monitor for recurrence."
- Escalate Sprint 1 blocker to CTO/platform for Vercel `SENTRY_DSN` provisioning and canary proof; this is now the gating item still failing acceptance.
