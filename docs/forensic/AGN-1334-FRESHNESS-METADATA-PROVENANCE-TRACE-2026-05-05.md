---
status: snapshot
audit-date: 2026-05-05
reason: ticket-bound forensic trace for AGN-1334 sourceStatus freshness metadata provenance
verified-by: claude
---

# AGN-1334 Freshness Metadata Provenance Trace for sourceStatus (2026-05-05)

## Scope and Evidence
- Mandatory opening completed this heartbeat (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- Freshness gate command result:
  - `npm run freshness:check`
  - Result: failed before endpoint probing because `tsx` is missing (`'tsx' is not recognized as an internal or external command`).
- Code evidence traced from:
  - `scripts/_data-store-write.mjs`
  - `src/lib/data-store.ts`
  - `apps/trendingrepo-worker/src/lib/redis.ts`
  - `apps/trendingrepo-worker/src/run.ts`
  - `src/app/api/cron/freshness/state/route.ts`
  - `src/app/api/health/route.ts`
  - `scripts/check-freshness.mts`

## Provenance Path (collector/worker write -> freshness-state row -> sourceStatus surfaced)

### 1) Writer path: collectors and worker write payload + meta
1. Collector path (`scripts/_data-store-write.mjs`):
   - `writeDataStore(key, value, opts)` writes in parallel:
     - payload: `ss:data:v1:<slug>`
     - meta: `ss:meta:v1:<slug>`
   - Meta shape is either:
     - legacy ISO string, or
     - JSON `{ writtenAt, writer?, runId?, commit? }` when provenance exists.
2. App/collector shared contract (`src/lib/data-store.ts`):
   - same namespace via `keys.payload()` / `keys.meta()`.
   - `parseWrittenAt()` accepts both legacy string and JSON-provenance shapes.
3. Worker path (`apps/trendingrepo-worker/src/lib/redis.ts` + `run.ts`):
   - `run.ts` calls `setCurrentFetcherName(fetcher.name)` before fetcher run.
   - `writeDataStore()` resolves writer provenance (`worker:<fetcher>`) and writes payload/meta.

### 2) Freshness-state evaluator path
1. Endpoint: `GET /api/cron/freshness/state` (`src/app/api/cron/freshness/state/route.ts`).
2. For each `SOURCE_SPECS` entry:
   - optional sidecar probe: `readMetaProbe(data/_meta/<source>.json)`.
   - redis/file timestamp probe(s): `readStoreProbe(slug)`.
3. `readStoreProbe(slug)` logic:
   - Reads raw meta key directly (`keys.meta(slug)`) for writer/run/commit parsing.
   - Reads timestamp via `store.writtenAt(slug)`.
   - If timestamp missing, falls back to `data/<slug>.json` file mtime.
4. Classification:
   - Per-probe status merged with age-budget classification.
   - `inspectSource()` uses `oldestIso(...)` across required probes, so stale sibling artifacts keep the source non-green.
5. Output includes provenance fields:
   - `lastWriter`, `lastWriterRunId`, `lastWriterCommit`.

### 3) `sourceStatus` surfaced to freshness checker
1. `scripts/check-freshness.mts` reads:
   - `/api/health?soft=1` (for `health.status` and `health.sourceStatus`)
   - `/api/cron/freshness/state` (for per-source freshness rows and blocking summary)
2. `sourceStatus` in `/api/health` is computed in `src/app/api/health/route.ts` as:
   - `degraded` when `getDegradedScannerSources().length > 0`, else `ok`.
3. This means:
   - `sourceStatus` is scanner-quality driven,
   - while freshness-state table is timestamp/budget driven.

## Drift / Staleness Risk Points
1. **Slug contract drift between writers and `SOURCE_SPECS`**:
   - Example: freshness spec for `twitter` still probes `redisSlugs: ["twitter-trending"]`, while collector writes `twitter-repo-signals`, `twitter-scans`, `twitter-ingestion-audit`.
2. **Payload/meta two-write window + fallback behavior**:
   - Writer performs 2 parallel SETs (payload/meta), not transactionally atomic.
   - Missing/invalid meta can push evaluator to file mtime fallback, which can mask Redis inconsistencies.
3. **Semantic split: `sourceStatus` vs freshness rows**:
   - `/api/health sourceStatus` may be `degraded` even when freshness rows are green, or vice versa.

## Reproducible Failure Modes (3)

### FM-1: Twitter key mismatch causes stale/DEAD classification despite successful collector run
- Evidence command:
```powershell
rg -n "twitter-trending|twitter-repo-signals|twitter-scans|twitter-ingestion-audit|writeDataStore\(" src/app/api/cron/freshness/state/route.ts scripts/collect-twitter-signals.ts
```
- Expected evidence:
  - `route.ts`: `twitter` source probes `twitter-trending`.
  - `collect-twitter-signals.ts`: writes `twitter-repo-signals`, `twitter-scans`, `twitter-ingestion-audit`.
- Log point:
  - `/api/cron/freshness/state` row `twitter` shows non-green or stale timestamp unrelated to latest Twitter collector writes.

### FM-2: Missing `tsx` blocks freshness gate before localhost/prod classification
- Repro command:
```powershell
npm run freshness:check
```
- Expected failure:
  - `'tsx' is not recognized as an internal or external command`.
- Impact:
  - No `health`/`sourceStatus` retrieval, so heartbeat cannot classify localhost as missing vs stale from this gate.

### FM-3: Semantic divergence (`sourceStatus` degraded while freshness blocking rows are green/non-blocking)
- Repro commands (when server reachable):
```powershell
curl -s http://localhost:3023/api/health?soft=1
curl -s -H "Authorization: Bearer $env:CRON_SECRET" http://localhost:3023/api/cron/freshness/state
```
- Compare:
  - `/api/health` -> `sourceStatus` (scanner quality)
  - `/api/cron/freshness/state` -> timestamp/budget statuses and `blocking_non_green`
- Log point:
  - `scripts/check-freshness.mts` prints both in same run line (`health=... sourceStatus=...`) plus row summary.

## Remediation Shortlist (owned-surface actionable)
1. Update `SOURCE_SPECS` Twitter slug mapping in `src/app/api/cron/freshness/state/route.ts` to active keys:
   - `twitter-repo-signals` (required), optional companions: `twitter-scans`, `twitter-ingestion-audit`.
2. Add CI guard script for key-contract drift:
   - assert every freshness redis slug has at least one writer reference in `scripts/**` or worker fetchers.
3. Harden freshness-check runtime dependency:
   - enforce `tsx` availability in CI/local preflight (`npm ci` + explicit tool check) before freshness probe.
4. Clarify health contract in docs:
   - `sourceStatus` (quality) vs freshness-state rows (timestamp budget), and which one is release-blocking.
5. Keep provenance mandatory on writers:
   - ensure collector and worker writes always include writer/run/commit where available to preserve attribution in `lastWriter*` fields.

## Minimal command set used this heartbeat
```powershell
npm run freshness:check
rg -n "writeDataStore|writer|runId|commit|meta|sourceStatus|freshness" scripts/_data-store-write.mjs src/lib/data-store.ts src/app/api/cron/freshness/state/route.ts src/app/api/health/route.ts apps/trendingrepo-worker/src/lib/redis.ts apps/trendingrepo-worker/src/run.ts scripts/check-freshness.mts
rg -n "twitter-trending|twitter-repo-signals|twitter-scans|twitter-ingestion-audit" src/app/api/cron/freshness/state/route.ts scripts/collect-twitter-signals.ts
```
