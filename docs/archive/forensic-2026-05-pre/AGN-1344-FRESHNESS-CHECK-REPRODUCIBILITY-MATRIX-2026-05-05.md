# AGN-1344 Freshness-check reproducibility matrix (5-run sample)

Date: 2026-05-05 (local timezone Asia/Makassar, UTC+08)
Scope: Reproduce `npm run freshness:check` five times and classify whether `localhost:3023` is missing or product is stale.

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

## 5-run matrix (attempt 1, before dependency restore)

| Run | startAt (UTC+08) | localhost:3023 reachable | Failure endpoint | Exit | Raw log |
|---|---|---|---|---:|---|
| 1 | 2026-05-05T06:20:52.5973896+08:00 | UNKNOWN (preflight not reached) | `tsx scripts/check-freshness.mts` command launch failure | 1 | `docs/forensic/raw/freshness-agn-1344/run-1-20260505T062052.log` |
| 2 | 2026-05-05T06:21:03.0868790+08:00 | UNKNOWN (preflight not reached) | `tsx scripts/check-freshness.mts` command launch failure | 1 | `docs/forensic/raw/freshness-agn-1344/run-2-20260505T062103.log` |
| 3 | 2026-05-05T06:21:17.8115228+08:00 | UNKNOWN (preflight not reached) | `tsx scripts/check-freshness.mts` command launch failure | 1 | `docs/forensic/raw/freshness-agn-1344/run-3-20260505T062117.log` |
| 4 | 2026-05-05T06:21:24.5365355+08:00 | UNKNOWN (preflight not reached) | `tsx scripts/check-freshness.mts` command launch failure | 1 | `docs/forensic/raw/freshness-agn-1344/run-4-20260505T062124.log` |
| 5 | 2026-05-05T06:21:41.0966648+08:00 | UNKNOWN (preflight not reached) | `tsx scripts/check-freshness.mts` command launch failure | 1 | `docs/forensic/raw/freshness-agn-1344/run-5-20260505T062141.log` |

## Attempt 1 QA verdict
- `localhost:3023 missing` cannot be determined from this sample because the freshness script did not start.
- `product stale/degraded` cannot be determined from this sample for the same reason.
- Reproducible blocker across all 5 runs: `tsx` is not installed/resolvable in PATH (`'tsx' is not recognized as an internal or external command`).

## 5-run matrix (attempt 2, after `npm install`)

| Run | startAt (UTC+08) | localhost:3023 reachable | Failure endpoint | Exit | Raw log |
|---|---|---|---|---:|---|
| 1 | 2026-05-05T08:56:51.0382894+08:00 | No | `GET http://localhost:3023` connection refused (`ECONNREFUSED`) | 2 | `docs/forensic/raw/freshness-agn-1344-rerun/run-1-20260505T085651.log` |
| 2 | 2026-05-05T08:56:54.8834566+08:00 | No | `GET http://localhost:3023` connection refused (`ECONNREFUSED`) | 2 | `docs/forensic/raw/freshness-agn-1344-rerun/run-2-20260505T085654.log` |
| 3 | 2026-05-05T08:56:57.9176724+08:00 | No | `GET http://localhost:3023` connection refused (`ECONNREFUSED`) | 2 | `docs/forensic/raw/freshness-agn-1344-rerun/run-3-20260505T085657.log` |
| 4 | 2026-05-05T08:57:00.5911952+08:00 | No | `GET http://localhost:3023` connection refused (`ECONNREFUSED`) | 2 | `docs/forensic/raw/freshness-agn-1344-rerun/run-4-20260505T085700.log` |
| 5 | 2026-05-05T08:57:03.2582062+08:00 | No | `GET http://localhost:3023` connection refused (`ECONNREFUSED`) | 2 | `docs/forensic/raw/freshness-agn-1344-rerun/run-5-20260505T085703.log` |

## Attempt 2 QA verdict
- `localhost:3023 missing`: YES (all 5 runs).
- `product stale/degraded`: NOT EVALUABLE in this attempt because preflight never reached freshness endpoints.
- Failure mode consistency: stable (5/5 `ECONNREFUSED`).

## 5-run matrix (attempt 3, with `npm run dev` started locally)

| Run | startAt (UTC+08) | localhost:3023 reachable | Failure endpoint | Exit | Raw log |
|---|---|---|---|---:|---|
| 1 | 2026-05-05T08:58:27.5080318+08:00 | Yes | freshness payload evaluated; non-green gate fail (`health=stale`, `sourceStatus=degraded`, `blocking_non_green=11`, `Sentry: MISSING`) | 1 | `docs/forensic/raw/freshness-agn-1344-rerun-live/run-1-20260505T085827.log` |
| 2 | 2026-05-05T08:58:42.1171676+08:00 | Partial (request accepted, then timeout) | request timed out while contacting `http://localhost:3023` | 2 | `docs/forensic/raw/freshness-agn-1344-rerun-live/run-2-20260505T085842.log` |
| 3 | 2026-05-05T08:59:04.1209391+08:00 | Partial (request accepted, then timeout) | request timed out while contacting `http://localhost:3023` | 2 | `docs/forensic/raw/freshness-agn-1344-rerun-live/run-3-20260505T085904.log` |
| 4 | 2026-05-05T08:59:27.0974728+08:00 | Partial (request accepted, then timeout) | request timed out while contacting `http://localhost:3023` | 2 | `docs/forensic/raw/freshness-agn-1344-rerun-live/run-4-20260505T085927.log` |
| 5 | 2026-05-05T08:59:46.0710353+08:00 | Partial (request accepted, then timeout) | request timed out while contacting `http://localhost:3023` | 2 | `docs/forensic/raw/freshness-agn-1344-rerun-live/run-5-20260505T085946.log` |

## Attempt 3 QA verdict
- `localhost:3023 missing`: NO (server was up and returned one full freshness payload).
- `product stale/degraded`: YES when request completed (run 1).
- Drift observed across the 5-run sample: 1 product stale/degraded failure + 4 local timeout failures.
- Likely unstable dependency in this run: local dev server responsiveness during repeated checks.

## Classification
- Product failure: YES (attempt 3 run 1: stale/degraded with non-green blocking rows).
- Localhost missing: YES in attempt 2 (`ECONNREFUSED`, 5/5), but NO in attempt 3 (server started and responded once).
- Environment/tooling failure: YES in attempt 1 (`tsx` missing), then resolved by `npm install`.
- Stability failure: YES in attempt 3 (4/5 timeouts despite local server process running).

## Explicit unblock criteria
1. Start local app server: `npm run dev` (port 3023).
2. Re-run command: `npm run freshness:check` five times.
3. If localhost is reachable, classify endpoint-level failures as product stale/degraded vs green.

## Residual risk
- Repeated local checks are not stable yet because localhost requests time out intermittently under repeated execution.
