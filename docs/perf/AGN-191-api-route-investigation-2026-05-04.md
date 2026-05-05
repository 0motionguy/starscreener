# AGN-191 route latency follow-up (2026-05-04)

## Scope
- Issue: `AGN-191` `[Sprint 1 audit] Investigate API p95 > 500ms on health/sidebar routes`
- Methods:
  - mandatory opener run completed in this heartbeat
  - 50-request curl timing loops (successful HTTP responses only)
  - route-level span tracing with `PERF_TRACE_ROUTES=1` on isolated local server (`:3123`)

## Freshness preflight status in this heartbeat
`npm run freshness:check` failed with real product degradation (not localhost outage):
- `health=ok`, `sourceStatus=degraded`
- `dead=5`, `blocking_non_green=4`
- `Sentry: MISSING`

## Baseline from AGN-150 (prior report)
| Route | p50 (s) | p95 (s) | p99 (s) | avg (s) |
|---|---:|---:|---:|---:|
| `/api/pipeline/sidebar-data` | 1.268 | 1.814 | 4.536 | 1.454 |
| `/api/health/sources` | 0.636 | 0.968 | 1.328 | 0.697 |

Source: `docs/perf/AGN-150-api-route-profile-2026-05-04.md`.

## Reproduction results (this heartbeat)
### A) Shared localhost target (`:3023`) with success/failure split
| Route | OK/50 | Fail/50 | p50 (s) | p95 (s) | p99 (s) | avg (s) |
|---|---:|---:|---:|---:|---:|---:|
| `/api/pipeline/sidebar-data` | 35 | 15 | 1.064 | 3.085 | 4.720 | 1.875 |
| `/api/health/sources` | 50 | 0 | 0.475 | 0.521 | 0.527 | 0.485 |

### B) Isolated traced server (`PERF_TRACE_ROUTES=1`, `:3123`)
| Route | OK/50 | Fail/50 | p50 (s) | p95 (s) | p99 (s) | avg (s) |
|---|---:|---:|---:|---:|---:|---:|
| `/api/pipeline/sidebar-data` | 50 | 0 | 0.996 | 1.165 | 1.881 | 1.044 |
| `/api/health/sources` | 50 | 0 | 0.471 | 0.504 | 0.517 | 0.478 |

## Dominant route-level spans
From trace logs on `:3123`:
- `/api/pipeline/sidebar-data`
  - dominant span: `getSidebarSourceCounts` (typical ~450-650ms, spikes >1.3s)
  - secondary one-time cold cost: `getDerivedRepos` (~483ms on first hit)
  - all other spans near-zero to single-digit ms (`getDerivedCategoryStats`, `buildReposById`, `pipeline.ensureReady`)
- `/api/health/sources`
  - internal total consistently ~0.0-0.5ms
  - `registerMs` and `getAllMs` both near-zero

## Classification
- `/api/pipeline/sidebar-data`: primarily **Redis-bound / store-read-bound** via `getSidebarSourceCounts`; occasional cold-start compute cost exists but is not dominant after warmup.
- `/api/health/sources`: **not compute-bound and not Redis-bound in route logic**; previous high p95 behavior from AGN-150 likely runtime/server contention around the local host process, not endpoint algorithmic cost.
- `:3023` instability for sidebar route (15/50 failures) indicates environment/runtime instability in that local process path.

## Concrete fix targets
1. Sidebar source-count fan-in target:
- Goal: `/api/pipeline/sidebar-data` p95 <= 0.9s local (50-success sample) and <= 1.2s worst-case during freshness degradation.
- Candidate fix: memoize/cache `getSidebarSourceCounts` for short TTL (15-30s) with in-flight dedupe, matching existing store refresh patterns.

2. Failure-rate target on `:3023` path:
- Goal: 0 failures in 50 calls for `/api/pipeline/sidebar-data`.
- Candidate fix: inspect local server logs for intermittent route failures and enforce typed EngineError surfacing in side-count reader path.

3. Health endpoint SLO guard:
- Goal: `/api/health/sources` p95 <= 0.55s (already met in this run) and no regressions >0.8s.
- Candidate fix: none in route code required now; treat regressions as runtime/process contention alerts.

## Instrumentation added in this heartbeat
- `src/lib/sidebar-data.ts`: optional `onTiming` callback and phase spans.
- `src/app/api/pipeline/sidebar-data/route.ts`: env-gated trace logging (`PERF_TRACE_ROUTES=1`).
- `src/app/api/health/sources/route.ts`: env-gated route timing log.

These traces are no-op unless `PERF_TRACE_ROUTES=1`.