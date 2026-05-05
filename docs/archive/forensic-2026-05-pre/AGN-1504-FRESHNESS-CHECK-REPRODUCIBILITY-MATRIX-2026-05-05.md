# AGN-1504 Freshness-check reproducibility matrix refresh (5-run sample)

Date: 2026-05-05 (local timezone Asia/Makassar, UTC+08)
Scope: Refresh reproducibility evidence for `npm run freshness:check` and classify localhost-missing vs stale/degraded outcomes.

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

| Run | startAt (UTC+08) | localhost:3023 reachable | Result class | Exit | Raw log |
|---|---|---|---|---:|---|
| 1 | 2026-05-05T09:18:11.0287902+08:00 | Partial (connection attempt succeeds, then timeout) | Request timeout while contacting `http://localhost:3023` | 2 | `docs/forensic/raw/freshness-agn-1504/run-1-20260505T091811.log` |
| 2 | 2026-05-05T09:18:33.7596429+08:00 | Yes | Freshness gate fail (`health=stale`, `sourceStatus=ok`, `blocking_non_green=11`) | 1 | `docs/forensic/raw/freshness-agn-1504/run-2-20260505T091833.log` |
| 3 | 2026-05-05T09:18:44.9177900+08:00 | Yes | Freshness gate fail (`health=stale`, `sourceStatus=ok`, `blocking_non_green=11`) | 1 | `docs/forensic/raw/freshness-agn-1504/run-3-20260505T091844.log` |
| 4 | 2026-05-05T09:19:00.6072092+08:00 | Yes | Freshness gate fail (`health=stale`, `sourceStatus=ok`, `blocking_non_green=11`) | 1 | `docs/forensic/raw/freshness-agn-1504/run-4-20260505T091900.log` |
| 5 | 2026-05-05T09:19:09.0480399+08:00 | Yes | Freshness gate fail (`health=stale`, `sourceStatus=ok`, `blocking_non_green=11`) | 1 | `docs/forensic/raw/freshness-agn-1504/run-5-20260505T091909.log` |

## QA verdict
- `localhost:3023 missing`: NO in this sample (0/5 `ECONNREFUSED`).
- `product stale/degraded`: YES (4/5 complete freshness evaluations failed on non-green blocking rows).
- `stability risk`: YES (1/5 timeout against localhost under repeated calls).

## Blocking source snapshot (runs 2-5)
- Summary stayed constant: `green=37`, `yellow=11`, `red=2`, `dead=0`, `blocking_non_green=11`, `advisory_non_green=2`.
- High-severity blocking RED rows: `producthunt`, `trending-repos`.
- Blocking YELLOW rows include: `agent-commerce`, `awesome-skills`, `claude-rss`, `lobsters`, `npm`, `openai-rss`, `staleness-report`, `twitter`, `unknown-mentions`.
- Sentry remained `MISSING` in all completed runs.

## Classification
- Product failure: YES.
- Environment blocker: PARTIAL (intermittent localhost timeout observed, but no missing-host failure).

## Residual risk
- Reproducibility confirms persistent stale-gate failure with an added intermittent timeout mode, so release evidence remains RED until blocking rows and timeout instability are resolved.
