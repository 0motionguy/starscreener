# AGN-1130 Freshness-check reproducibility matrix (3-run sample)

Date: 2026-05-05 (local timezone Asia/Makassar, UTC+08)
Scope: Reproduce `npm run freshness:check` behavior on localhost for release QA evidence.

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

## 3-run matrix

| Run | checkedAt (UTC) | localhost:3023 reachable | health/sourceStatus | Summary | Exit | Notes |
|---|---|---|---|---|---:|---|
| 1 | 2026-05-04T20:24:58.583Z | Yes | `health=stale sourceStatus=ok` | `green=40 yellow=9 red=1 dead=0 blocking_non_green=8 advisory_non_green=2` | 1 | `trending-repos=RED`; no DEAD rows. |
| 2 | 2026-05-04T20:25:15.126Z | Yes | `health=stale sourceStatus=ok` | `green=18 yellow=10 red=4 dead=18 blocking_non_green=27 advisory_non_green=5` | 1 | Massive state swing within ~17s; many keys flipped to DEAD/RED. |
| 3 | 2026-05-04T20:25:15.229Z | Yes | `health=stale sourceStatus=ok` | `green=18 yellow=10 red=4 dead=18 blocking_non_green=27 advisory_non_green=5` | 1 | Byte-for-byte same summary profile as Run 2 within ~0.1s. |

## QA verdict
- Localhost is **not missing** (`http://localhost:3023` reachable in all 3 runs).
- Product is **stale/degraded** in all 3 runs (`freshness:check` non-zero every run).
- Reproducibility finding: freshness output is **not stable** across immediate reruns; there is a severe consistency swing between run 1 and run 2 despite near-identical execution context.

## Residual risk
- Release evidence that relies on a single freshness sample can be misleading.
- `Sentry: MISSING` persisted in all runs, so alert-corroboration is unavailable.

## Suggested follow-up verification
1. Capture 10-run burst sample with per-run raw JSON payload from `/api/cron/freshness/state`.
2. Diff key-level transitions for rows flipping `GREEN -> DEAD` within seconds.
3. Correlate with writer timestamps and data-store read path in `src/lib/data-store.ts`.
