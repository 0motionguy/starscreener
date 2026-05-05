---
status: archive
audit-date: 2026-05-05
reason: dated release-validation heartbeat artifact
---

# AGN-737 Redis backup strategy + restore drill (2026-05-04)

Timestamp (UTC): 2026-05-04T15:15:29.709Z  
Issue: AGN-737  
Owner lane: Release SRE

## Mandatory opening + freshness gate

Completed:
- Read `CLAUDE.md`
- Read `docs/ENGINE.md`
- Read `docs/SITE-WIREMAP.md`
- Read `docs/AUDIT-2026-05-04.md`
- Read `docs/forensic/00-INDEX.md`
- Read `tasks/CURRENT-SPRINT.md` and `tasks/BACKLOG.md`
- Ran `npm run freshness:check`

Freshness result:
- `localhost:3023` reachable (not missing)
- Product classification: stale/degraded
- Blocking non-green rows: `npm` (YELLOW), `producthunt` (YELLOW), `trending-repos` (YELLOW)
- Additional gate: `Sentry: MISSING`

## Live Redis operational evidence (Railway production)

Railway target:
- Project: `starscreener`
- Environment: `production`
- Service: `trendingrepo-worker`

Redis persistence + restore drill command path:
- Pulled `REDIS_URL` from `railway variables --json`
- Ran Node/ioredis synthetic drill using `SET` -> `DUMP` -> `DEL` -> `RESTORE` -> hash + TTL verification

Observed evidence:
```json
{
  "checkedAt": "2026-05-04T15:15:29.709Z",
  "persistence": {
    "loading": "0",
    "async_loading": "0",
    "aof_enabled": "0",
    "rdb_last_bgsave_status": "ok",
    "rdb_changes_since_last_save": "11",
    "rdb_last_save_time": "1777907712"
  },
  "drill": {
    "key": "agn737:restore-drill:2026-05-04T15-15-29-422Z",
    "ttlBefore": 600,
    "ttlAfter": 600,
    "dumpBytes": 91,
    "sha": "d0b8410307a0ec198d0920b1e8543b73030a99d50cd4d9f0fbbd301473cf4394",
    "shaAfter": "d0b8410307a0ec198d0920b1e8543b73030a99d50cd4d9f0fbbd301473cf4394",
    "restoredMatch": true
  }
}
```

Interpretation:
- Redis is available and writable.
- Redis RDB persistence lane reports last background save status `ok`.
- Synthetic restore drill passed integrity and TTL parity checks.

## Backup strategy (current verified posture)

1. Persistence mode:
- RDB snapshots active (`rdb_last_bgsave_status=ok`).
- AOF disabled (`aof_enabled=0`).

2. Restore strategy:
- Primary restore lane uses Redis native object restore (`DUMP`/`RESTORE`) semantics validated by drill.
- Application fallback lane remains three-tier read (`Redis -> bundled JSON -> in-memory LKG`) for user-facing continuity if Redis is degraded.

3. Ongoing verification:
- Added workflow `.github/workflows/sre-redis-restore-drill.yml`.
- Cadence: weekly Mondays (`20 3 * * 1`) + manual `workflow_dispatch`.
- Workflow fails if restore integrity check fails.

## Workflow/crons live inspection status for this heartbeat

Attempted command:
- `gh workflow list --limit 200`

Observed result:
- `HTTP 401: Bad credentials`

Impact:
- Live Actions inspection is blocked in this shell despite Redis drill success.
- Release-SRE acceptance remains blocked until GitHub auth is restored for this operator shell.

## Rollback readiness packet

If Redis corruption is suspected:
1. Pause write-heavy collectors/workflows.
2. Run manual `SRE Redis Restore Drill` workflow to validate current restore path.
3. If drill fails, escalate incident severity and switch service posture to fallback-read validation (`bundled JSON + LKG`) while recovering Redis.
4. After recovery, rerun drill and `npm run freshness:check`; require `blocking_non_green=0` before clearing incident.

## Blockers / escalation

Blocked on:
- GitHub CLI auth for this shell (`gh` returns `401 Bad credentials`), preventing required live workflow inspection evidence.

Needs:
- CTO/platform provide valid GitHub token/session context for Release SRE shell.
