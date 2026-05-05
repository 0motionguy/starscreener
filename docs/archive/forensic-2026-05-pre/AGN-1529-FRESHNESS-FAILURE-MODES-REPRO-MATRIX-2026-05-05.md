# AGN-1529 [Sprint 1 audit] QA reproducibility matrix for freshness-check failure modes

Date: 2026-05-05 (Asia/Makassar, UTC+08)  
Role: Release QA  
Issue: AGN-1529

## Mandatory opening completion
Completed before verification in this heartbeat:
- `CLAUDE.md`
- `docs/ENGINE.md`
- `docs/SITE-WIREMAP.md`
- `docs/AUDIT-2026-05-04.md`
- `docs/forensic/00-INDEX.md`
- `tasks/CURRENT-SPRINT.md`
- `tasks/BACKLOG.md`

## Repro command
```bash
npm run freshness:check
```

## 5-run reproducibility matrix

| Run | Start (UTC+08) | Localhost 3023 missing? | Failing endpoint | HTTP status | Exit | Classification |
|---|---|---|---|---|---:|---|
| 1 | 2026-05-05T09:24:34.0513743+08:00 | No | `/api/health?soft=1` | 500 | 2 | Product failure |
| 2 | 2026-05-05T09:24:38.4532948+08:00 | No | `/api/cron/freshness/state` | 500 | 2 | Product failure |
| 3 | 2026-05-05T09:24:40.9641725+08:00 | No | `/api/health?soft=1` | 500 | 2 | Product failure |
| 4 | 2026-05-05T09:24:43.3234364+08:00 | No | `/api/health?soft=1` | 500 | 2 | Product failure |
| 5 | 2026-05-05T09:24:45.3320326+08:00 | No | `/api/cron/freshness/state` | 500 | 2 | Product failure |

## Binary acceptance outputs
- Localhost missing (`ECONNREFUSED` / unreachable): **RED** (not reproduced in this sample)
- Stale/degraded product behavior: **RED** (reproduced 5/5 via HTTP 500)
- Failure-mode reproducibility: **GREEN** (two failure modes repeatedly reproduced on command rerun)

## QA verdict
- `npm run freshness:check` is not blocked by a missing localhost in this sample.
- The command fails due to server-side HTTP 500 on two endpoints:
  - `GET /api/health?soft=1`
  - `GET /api/cron/freshness/state`
- Outcome is a **product/runtime failure**, not an environment blocker.

## Residual risk
- Release readiness remains blocked: freshness gate cannot provide a pass signal while either endpoint returns HTTP 500.
- Since both endpoints fail intermittently across runs, any single successful probe would be insufficient without repeated verification.
