# AGN-1280 - Sprint 1 audit: API route EngineError compliance sweep

**Date:** 2026-05-05  
**Scope:** `src/app/api/**` error envelopes + caller-reachable throw paths in `src/lib/pipeline/**`  
**Mode:** Read-only audit (no code mutations in this pass)

## TL;DR

Route-level EngineError compliance is materially improved (including `pipeline/deltas` now using `serverError(...)`), but two caller-layer bare `Error` throws still sit on API-reachable paths and several routes still bypass canonical EngineError tagging in Sentry capture branches.

## 1) Violation inventory by file

### A. Bare `Error` throws on API-reachable paths

1. `src/lib/pipeline/alerts/engine.ts:107`  
   `throw new Error(...)` in `evaluateRulesForRepo` invariant mismatch branch.

2. `src/lib/pipeline/storage/file-persistence.ts:56`  
   `throw new Error(...)` for invalid `TRENDINGREPO_DATA_DIR/STARSCREENER_DATA_DIR` (`..` segment guard).

### B. Route catch paths with Sentry capture but non-canonical envelope/tag flow

1. `src/app/api/pipeline/ingest/route.ts:174` and `src/app/api/pipeline/ingest/route.ts:188`  
   Manual `Sentry.captureException(...)` in catch before returning `serverError(...)` (double-capture path).

2. `src/app/api/pipeline/recompute/route.ts:66` and `src/app/api/pipeline/recompute/route.ts:69`  
   Same double-capture pattern (`captureException` + `serverError`).

3. `src/app/api/openapi.json/route.ts:158` and `src/app/api/openapi.json/route.ts:182`  
   Same double-capture pattern.

4. `src/app/api/repos/[owner]/[name]/mentions/route.ts:286` and `src/app/api/repos/[owner]/[name]/mentions/route.ts:340`  
   Raw `Sentry.captureException(err)` calls; one call has no tags, second has only route tag; neither routes through `serverError` in those branches.

### C. Auth/cron envelope drift (not a 500 leak, but contract drift)

1. `src/lib/api/auth.ts:467` (`authFailureResponse`)  
2. `src/lib/api/auth.ts:503` (`adminAuthFailureResponse`)  

Cron/admin denials still emit legacy `{ ok: false, reason: ... }` shape rather than canonical `{ ok: false, error, code }` used by newer handlers.

## 2) Category mapping recommendation

| Location | Recommended type | Category | Source | Rationale |
| --- | --- | --- | --- | --- |
| `src/lib/pipeline/alerts/engine.ts:107` | `AdminFatalError` | `fatal` | `admin` | Invariant breach (`ctx.repo.id` mismatch) indicates programmer/state contract violation, not user-recoverable input. |
| `src/lib/pipeline/storage/file-persistence.ts:56` | `DataStoreFatalError` | `fatal` | `data-store` | Misconfigured data dir is operator/config invariant failure; should route as infra/data-store class failure. |

## 3) Sentry logging gap notes

1. **Double-capture noise** in `pipeline/ingest`, `pipeline/recompute`, and `openapi.json` routes: local `Sentry.captureException` plus `serverError(...)` (which already captures + enriches tags) can create duplicate events and inconsistent tag payloads per route.
2. **Unstructured capture** in `repos/[owner]/[name]/mentions`: one branch captures without tags; another only tags route. EngineError `source/category` tags are not guaranteed in those paths.
3. **Positive change confirmed:** `src/app/api/pipeline/deltas/route.ts:200` now funnels failures through `serverError(...)` (`PIPELINE_DELTAS_FAILED`), restoring canonical envelope/tags for this route.

## 4) Fix-ready issue list (with risk tags)

1. **[RISK:LOW] Replace bare Error in alerts engine**  
   - File: `src/lib/pipeline/alerts/engine.ts:107`  
   - Change: `throw new AdminFatalError(...)` and preserve metadata keys useful for triage.

2. **[RISK:LOW] Replace bare Error in file persistence env guard**  
   - File: `src/lib/pipeline/storage/file-persistence.ts:56`  
   - Change: `throw new DataStoreFatalError(...)` with env key context.

3. **[RISK:LOW] Remove duplicate Sentry capture in ingest route catch**  
   - File: `src/app/api/pipeline/ingest/route.ts:174-188`  
   - Change: drop manual `captureException`, keep `serverError(...)` as single funnel.

4. **[RISK:LOW] Remove duplicate Sentry capture in recompute route catch**  
   - File: `src/app/api/pipeline/recompute/route.ts:66-69`  
   - Change: same as above.

5. **[RISK:LOW] Remove duplicate Sentry capture in openapi route catch**  
   - File: `src/app/api/openapi.json/route.ts:158-182`  
   - Change: same as above.

6. **[RISK:MED] Normalize mentions route error funnel to canonical path**  
   - File: `src/app/api/repos/[owner]/[name]/mentions/route.ts:286,340`  
   - Change: route catch branches through `serverError(...)` or ensure every capture spreads EngineError tags.

7. **[RISK:MED] Auth/cron denial envelope normalization sweep**  
   - Files: `src/lib/api/auth.ts:467,503` and affected route callers  
   - Change: unify on `{ ok:false, error, code }` to remove legacy `reason` shape drift.

## 5) Retry/backoff and data-store read-path notes (bucket context)

- Retry/backoff: no new blocker identified in this pass; current hotspots show explicit retry/backoff implementations in collector and adapter paths (`scripts/collect-twitter-signals.ts`, `scripts/scrape-funding-news.mjs`, `src/lib/pipeline/adapters/github-adapter.ts`).
- Data-store read-paths: previously identified direct file-read drift remains relevant for follow-up (`src/app/sitemap-news.xml/route.ts:76`, `src/app/api/admin/overview/route.ts:142`, `src/app/api/cron/freshness/state/route.ts:469`, `src/app/api/admin/pool-state/route.ts:705`).

## 6) Acceptance checklist

- [x] Violation inventory by file  
- [x] Category mapping recommendation  
- [x] Sentry logging gap notes  
- [x] Fix-ready issue list with risk tags
