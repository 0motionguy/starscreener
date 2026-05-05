# AGN-1192 [Sprint 1 audit] Data Pipeline source-to-UI trace: twitter

Date: 2026-05-05  
Owner: Data Pipeline (`paperclip-data`)

## Scope
Trace the Twitter/X data path from scheduled collector to `/twitter` UI using code + local runtime evidence.

## Mandatory preflight result
- `npm run freshness:check` (2026-05-05, local run):
  - Result: `GET http://localhost:3023/api/health?soft=1 -> HTTP 500`
  - Classification: `localhost:3023` is reachable (not missing), product is stale/degraded.

## Verified source-to-UI chain

1. Scheduler and collector entrypoint
- Workflow: `.github/workflows/collect-twitter.yml`
  - Cron every 3h: line 4
  - Collector command: `npm run collect:twitter`: line 80
  - Commits append-only files + source meta:
    - `.data/twitter-repo-signals.jsonl`: line 95
    - `.data/twitter-scans.jsonl`: line 96
    - `.data/twitter-ingestion-audit.jsonl`: line 97
    - `data/_meta/twitter.json`: line 98

2. Collector persistence behavior
- Script: `scripts/collect-twitter-signals.ts`
  - Hydrates store before ingest (prevents truncation): line 812 (`ensureTwitterReady()`)
  - Flushes local persistent store: line 928 (`flushTwitterPersist()`)
  - Mirrors JSONL payloads into Redis data-store keys: lines 779-794 (`mirrorTwitterFilesToDataStore()` + `writeDataStore(...)`)
    - `twitter-repo-signals`: line 787
    - `twitter-scans`: line 790
    - `twitter-ingestion-audit`: line 793
  - Emits freshness sidecar meta: line 989 (`writeSourceMeta(...)`)

3. Data-store contract used by readers
- `src/lib/data-store.ts`
  - Namespace keys: `ss:data:v1` and `ss:meta:v1`: lines 127-128
  - Read path is Redis -> file -> memory fallback: lines 282-349
  - Writer records payload + meta timestamp/provenance: lines 372-391

4. Twitter read path to UI
- Refresh hook from store:
  - `src/lib/twitter/signal-data.ts:86` (`refreshTwitterSignalsFromStore()`)
  - Reads key `twitter-repo-signals` via `getDataStore().read(...)`: line 99
- Leaderboard/service layer:
  - `src/lib/twitter/service.ts:935` (`getTwitterLeaderboard`)
  - `src/lib/twitter/service.ts:963` (`getTwitterTrendingRepoLeaderboard`)
  - `src/lib/twitter/service.ts:1067` (`getTwitterOverviewStats`)
- UI route:
  - `src/app/twitter/page.tsx:320` calls `refreshTwitterSignalsFromStore()`
  - `src/app/twitter/page.tsx:323-326` loads leaderboard + stats for render

## Runtime evidence snapshot (local workspace)
- Local JSONL files exist and are fresh in workspace:
  - `.data/twitter-repo-signals.jsonl` mtime: `2026-05-04 11:26:24`
  - `.data/twitter-scans.jsonl` mtime: `2026-05-04 11:26:24`
  - `.data/twitter-ingestion-audit.jsonl` mtime: `2026-05-04 11:26:24`
- Local source-meta sidecar currently missing:
  - `data/_meta/twitter.json`: `MISSING` in this workspace snapshot.

## Conclusion
- Twitter source-to-UI pipeline is wired end-to-end through the expected surfaces:
  - scheduled workflow -> collector -> dual-write (`.data` + Redis keys) -> refresh hook -> twitter service -> `/twitter` page.
- Current local blocker for freshness acceptance is platform health (`/api/health?soft=1` returns 500), not a missing `/twitter` read path.
