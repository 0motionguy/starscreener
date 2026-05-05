# AGN-1275 trending source freshness budget variance check (2026-05-05)

- Checked at (freshness state): 2026-05-05T01:01:31.084Z
- Health endpoint at check: status=stale, sourceStatus=degraded, computedAt=2026-05-04T04:21:48.259Z
- Summary from freshness-state: green=37, yellow=11, red=2, dead=0
- Scope in this audit: trending-repos dependent sources and direct scoring inputs listed in `src/app/api/cron/freshness/state/route.ts`

## Acceptance evidence
1. Last-success timestamps captured from live `/api/cron/freshness/state` payload.
2. Budget violators identified using `varianceHours = ageHours - budgetHours` for blocking sources.
3. Product impact classified per violating source.
4. Evidence file published at this path.

## Blocking budget violators (non-green)

| source | status | last_update_utc | budget | age_h | variance_h | product_impact | writer |
|---|---|---|---:|---:|---:|---|---|
| producthunt | RED | 2026-05-03T23:55:30.517Z | 12h | 25.1 | 13.1 | high: signal coverage loss on route + derived ranking input | github-actions:Refresh ProductHunt launches |
| npm | YELLOW | 2026-05-03T12:55:32.476Z | 24h | 36.1 | 12.1 | high: signal coverage loss on route + derived ranking input |  |
| trending-repos | RED | 2026-05-04T08:06:14.928Z | 6h | 16.92 | 10.92 | critical: homepage + derived repos stale | worker:oss-trending |
| twitter | YELLOW | 2026-05-04T03:39:14.754Z | 12h | 21.37 | 9.37 | high: signal coverage loss on route + derived ranking input |  |
| lobsters | YELLOW | 2026-05-04T05:05:00.519Z | 12h | 19.94 | 7.94 | high: signal coverage loss on route + derived ranking input |  |

## Scoped source snapshot (including green rows for traceability)

| source | status | blocking | last_update_utc | budget | age_h | variance_h |
|---|---|---:|---|---:|---:|---:|
| arxiv | GREEN | true | 2026-05-04T04:32:35.983Z | 24h | 20.48 | -3.52 |
| bluesky | GREEN | true | 2026-05-04T20:26:46.348Z | 6h | 4.58 | -1.42 |
| collection-rankings | GREEN | true | 2026-05-05T00:18:22.014Z | 12h | 0.72 | -11.28 |
| deltas | GREEN | true | 2026-05-05T00:40:00.084Z | 6h | 0.36 | -5.64 |
| devto | GREEN | true | 2026-05-04T14:30:01.546Z | 24h | 10.52 | -13.48 |
| funding-news | GREEN | true | 2026-05-04T02:01:53.063Z | 24h | 22.99 | -1.01 |
| hackernews | GREEN | true | 2026-05-04T20:27:32.871Z | 6h | 4.57 | -1.43 |
| hot-collections | GREEN | true | 2026-05-05T00:22:38.992Z | 6h | 0.65 | -5.35 |
| huggingface | GREEN | true | 2026-05-04T04:10:43.543Z | 24h | 20.85 | -3.15 |
| huggingface-datasets | GREEN | true | 2026-05-04T04:13:28.901Z | 24h | 20.8 | -3.2 |
| huggingface-spaces | GREEN | true | 2026-05-04T04:30:12.543Z | 24h | 20.52 | -3.48 |
| lobsters | YELLOW | true | 2026-05-04T05:05:00.519Z | 12h | 19.94 | 7.94 |
| npm | YELLOW | true | 2026-05-03T12:55:32.476Z | 24h | 36.1 | 12.1 |
| producthunt | RED | true | 2026-05-03T23:55:30.517Z | 12h | 25.1 | 13.1 |
| recent-repos | GREEN | true | 2026-05-05T00:25:09.643Z | 6h | 0.61 | -5.39 |
| reddit | GREEN | true | 2026-05-04T21:09:08.826Z | 6h | 3.87 | -2.13 |
| repo-metadata | GREEN | true | 2026-05-05T00:56:37.840Z | 6h | 0.08 | -5.92 |
| trending-repos | RED | true | 2026-05-04T08:06:14.928Z | 6h | 16.92 | 10.92 |
| twitter | YELLOW | true | 2026-05-04T03:39:14.754Z | 12h | 21.37 | 9.37 |

## Immediate unblock criteria for this issue
- This issue is actionable (not externally blocked): freshness state and health endpoints are reachable in this heartbeat.
- Remaining remediation belongs to source owners: restore each non-green blocking source to GREEN by running/fixing the owning collectors.
- Highest-priority restorations by variance: `trending-repos`, `producthunt`, `twitter`, `lobsters`, `npm`.
