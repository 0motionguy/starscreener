# AGN-150 Performance Profile - Top 3 API Routes

Date: 2026-05-04
Scope: localhost profiling on `http://localhost:3023`

## Mandatory preflight
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`
- Freshness: `npm run freshness:check` => PASS (`green=50 yellow=0 red=0 dead=0`)
- Classification: not a localhost-down failure and not a freshness product-data failure. Data freshness passed; advisory row remains `Sentry: MISSING`.

## Method
- Tooling: `curl -w "%{http_code} %{time_total}"`
- Sample size: `50` requests per route
- Percentiles: computed from successful HTTP 200 timings only
- Route set selected for health/freshness and high-traffic sidebar dependency:
  - `/api/pipeline/sidebar-data`
  - `/api/health?soft=1`
  - `/api/health/sources`

## Per-route latency table

| Route | HTTP success | p50 (s) | p95 (s) | p99 (s) | avg (s) | Flag |
|---|---:|---:|---:|---:|---:|---|
| `/api/pipeline/sidebar-data` | 50/50 | 1.268 | 1.814 | 4.536 | 1.454 | `p95 > 500ms` |
| `/api/health/sources` | 50/50 | 0.636 | 0.968 | 1.328 | 0.697 | `p95 > 500ms` |
| `/api/health?soft=1` | 50/50 | 0.643 | 0.938 | 1.101 | 0.702 | `p95 > 500ms` |

## Top 3 by p95
1. `/api/pipeline/sidebar-data` (`p95=1.814s`)
2. `/api/health/sources` (`p95=0.968s`)
3. `/api/health?soft=1` (`p95=0.938s`)

## Threshold follow-up issue
- Filed child issue: `AGN-191` (`[Sprint 1 audit] Investigate API p95 > 500ms on health/sidebar routes`), as required by AGN-150 acceptance criteria.

## Notes
- Exploratory probe showed `/api/cron/freshness/state` returned `401` without auth token and was excluded from percentile ranking.
- This task is diagnostic-only; no optimization code changes were made.
