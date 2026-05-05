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

## 5-run matrix

| Run | startAt (UTC+08) | localhost:3023 reachable | Failure endpoint | Exit | Raw log |
|---|---|---|---|---:|---|
| 1 | 2026-05-05T06:20:52.5973896+08:00 | UNKNOWN (preflight not reached) | `tsx scripts/check-freshness.mts` command launch failure | 1 | `docs/forensic/raw/freshness-agn-1344/run-1-20260505T062052.log` |
| 2 | 2026-05-05T06:21:03.0868790+08:00 | UNKNOWN (preflight not reached) | `tsx scripts/check-freshness.mts` command launch failure | 1 | `docs/forensic/raw/freshness-agn-1344/run-2-20260505T062103.log` |
| 3 | 2026-05-05T06:21:17.8115228+08:00 | UNKNOWN (preflight not reached) | `tsx scripts/check-freshness.mts` command launch failure | 1 | `docs/forensic/raw/freshness-agn-1344/run-3-20260505T062117.log` |
| 4 | 2026-05-05T06:21:24.5365355+08:00 | UNKNOWN (preflight not reached) | `tsx scripts/check-freshness.mts` command launch failure | 1 | `docs/forensic/raw/freshness-agn-1344/run-4-20260505T062124.log` |
| 5 | 2026-05-05T06:21:41.0966648+08:00 | UNKNOWN (preflight not reached) | `tsx scripts/check-freshness.mts` command launch failure | 1 | `docs/forensic/raw/freshness-agn-1344/run-5-20260505T062141.log` |

## QA verdict
- `localhost:3023 missing` cannot be determined from this sample because the freshness script did not start.
- `product stale/degraded` cannot be determined from this sample for the same reason.
- Reproducible blocker across all 5 runs: `tsx` is not installed/resolvable in PATH (`'tsx' is not recognized as an internal or external command`).

## Classification
- Product failure: NO (not reached).
- Environment blocker: YES (`tsx` toolchain missing).

## Residual risk
- Release evidence for freshness status is currently invalid until the `tsx` runtime dependency is restored and the check script can execute.
