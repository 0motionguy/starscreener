# AGN-1283 Freshness-check reproducibility matrix (5-run sample)

Date: 2026-05-05 (local timezone Asia/Makassar, UTC+08)
Scope: Reproduce `npm run freshness:check` five times to verify localhost presence vs product freshness failure mode.

## Mandatory opening confirmation
Verified before sampling:
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

## 5-run matrix

| Run | startAt (UTC+08) | endAt (UTC+08) | localhost:3023 reachable | Failure endpoint | Exit | Raw log |
|---|---|---|---|---|---:|---|
| 1 | 2026-05-05T05:48:06.5778688+08:00 | 2026-05-05T05:48:09.3117035+08:00 | Yes | `GET /api/health?soft=1 -> HTTP 500` | 2 | `docs/forensic/raw/freshness-agn-1283/run-1-20260505T054806.log` |
| 2 | 2026-05-05T05:48:11.3185059+08:00 | 2026-05-05T05:48:14.9295299+08:00 | Yes | `GET /api/cron/freshness/state -> HTTP 500` | 2 | `docs/forensic/raw/freshness-agn-1283/run-2-20260505T054811.log` |
| 3 | 2026-05-05T05:48:16.9313278+08:00 | 2026-05-05T05:48:19.7213473+08:00 | Yes | `GET /api/health?soft=1 -> HTTP 500` | 2 | `docs/forensic/raw/freshness-agn-1283/run-3-20260505T054816.log` |
| 4 | 2026-05-05T05:48:21.7229665+08:00 | 2026-05-05T05:48:27.7020152+08:00 | Yes | `GET /api/health?soft=1 -> HTTP 500` | 2 | `docs/forensic/raw/freshness-agn-1283/run-4-20260505T054821.log` |
| 5 | 2026-05-05T05:48:29.7039734+08:00 | 2026-05-05T05:48:33.1938539+08:00 | Yes | `GET /api/cron/freshness/state -> HTTP 500` | 2 | `docs/forensic/raw/freshness-agn-1283/run-5-20260505T054829.log` |

## QA verdict
- `localhost:3023` is not missing in all 5 runs.
- Product is stale/degraded in all 5 runs: `freshness:check` failed every run (`exit=2`).
- Failure mode is reproducible and oscillates between two backend endpoints:
  - `/api/health?soft=1` HTTP 500 (3/5)
  - `/api/cron/freshness/state` HTTP 500 (2/5)

## Classification
- Product failure: YES (HTTP 500 from freshness endpoints).
- Environment blocker: NO (localhost is reachable; no `ECONNREFUSED` in this sample).

## Residual risk
- Release evidence remains red because a passing local freshness gate cannot be reproduced.
- The alternating 500 endpoint suggests unstable backend freshness path behavior rather than host unavailability.
