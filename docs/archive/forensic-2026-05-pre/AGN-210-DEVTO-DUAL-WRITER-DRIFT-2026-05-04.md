# AGN-210 DevTo dual-writer drift packet (worker vs GHA) — 2026-05-04

Scope: data-pipeline writer attribution for `devto-mentions` and `devto-trending`.

## Evidence captured in this heartbeat

### 1) Mandatory freshness preflight
- Command: `npm run freshness:check`
- Result: failed by timeout (`freshness-check: request timed out while contacting http://localhost:3023`).
- Interpretation: localhost was not proven missing, but freshness baseline is degraded/unreliable for this heartbeat.

### 2) Redis/file drift packet (live)
- Command: `node scripts/audit-devto-dual-writer-drift.mjs`
- Artifact: `.audit/AGN-210-devto-dual-writer-drift-packet.json`
- Result snapshot:
  - `redisBackend: "ioredis"` (Redis reachable in this run context)
  - `devto-mentions` and `devto-trending` both have:
    - `redisMetaWrittenAt` set
    - `redisPayloadFetchedAt` set
    - `fileFetchedAt` set and aligned with payload (`payloadLagHours ~= 0.06`)
    - `writer: null` and `writerKind: "unknown"`
  - Summary: `unresolvedWriter=2`, `writerDisagreement=2`, `payloadLagOver1h=0`, `fileLagOver1h=0`.

### 3) Writer-path code verification
- Worker path sets writer provenance slot:
  - `apps/trendingrepo-worker/src/run.ts` uses `setCurrentFetcherName(fetcher.name)` and clears in `finally`.
  - Worker redis writer resolves `writer: worker:<fetcher>` when slot is present (`apps/trendingrepo-worker/src/lib/redis.ts`).
- GHA/script path writes provenance only when GitHub env vars are present:
  - `scripts/_data-store-write.mjs` sets `writer` from `GITHUB_WORKFLOW` if present, else falls back to bare ISO meta.
- DevTo writers target same shared keys:
  - Worker: `apps/trendingrepo-worker/src/fetchers/devto/index.ts` writes `devto-mentions`, `devto-trending`.
  - GHA/script: `scripts/scrape-devto.mjs` writes the same keys.

## Last-7 run classification for `scrape-devto` (available evidence)

Primary command target (required): `gh run list --workflow scrape-devto.yml --limit 7 ...`
- Current run result: `HTTP 401: Bad credentials`.

Fallback evidence used:
- Local artifact: `.tmp-workflow-last7-classification.json`
- Entry: `workflow = "Refresh dev.to signals"`, `classification = "STABLE"`, `runs_considered = 2`, `success = 2`, `failure = 0`, sequence `success > success`.

Fail-signature mapping:
- No failing signature present in the available last-7-window artifact for this heartbeat.
- Live `gh run view --log-failed` extraction is blocked by GitHub auth failure.

## Re-queue retry evidence (board comment: "bumped concurrency to 5, retry now")

- Retry timestamp: `2026-05-04T15:46Z` heartbeat.
- `gh run list --workflow scrape-devto.yml --limit 7 --json ...` still returns:
  - `HTTP 401: Bad credentials`
- Drift packet rerun completed:
  - `generatedAt: 2026-05-04T15:46:56.201Z`
  - `redisBackend: ioredis`
  - `unresolvedWriter=2` remains unchanged.

## Re-queue retry evidence (round 1: "retry pickup")

- Retry timestamp: `2026-05-04T15:50Z` heartbeat.
- Freshness preflight: `npm run freshness:check` timed out contacting `http://localhost:3023`.
- `gh run list --workflow scrape-devto.yml --limit 7 --json ...` still returns:
  - `HTTP 401: Bad credentials`
- Drift packet rerun summary remains:
  - `unresolvedWriter=2`
  - `writerDisagreement=2`
  - `payloadLagOver1h=0`

## Re-queue retry evidence (round 2: "bumped-concurrency-retry")

- Retry timestamp: `2026-05-05` heartbeat.
- Freshness preflight: `npm run freshness:check` timed out contacting `http://localhost:3023`.
- `gh run list --workflow scrape-devto.yml --limit 7 --json ...` still returns:
  - `HTTP 401: Bad credentials`
- Drift packet rerun summary remains:
  - `unresolvedWriter=2`
  - `writerDisagreement=2`
  - `payloadLagOver1h=0`

## Drift decision

1. **Current source-of-truth payload is aligned across Redis payload and file mirror** for both DevTo keys (no >1h lag).
2. **Writer attribution is still unresolved** because meta provenance currently lands without `writer` on the latest entries for both keys.
3. **Dual-writer ambiguity remains open**: both worker and GHA paths are capable of writing the same keys, but the latest live records do not identify which path won last-write.

## Explicit unblock owner and action

- **Blocked on**: missing GitHub CLI credentials in this run context (`gh run list ...` returns 401), preventing required live last-7 run fetch/log classification from API.
- **Needs (owner)**: **CTO / platform owner** must provide valid GitHub Actions read credentials for this execution context (restore `gh` auth), then rerun:
  - `gh run list --workflow scrape-devto.yml --limit 7 --json ...`
  - `gh run view <failed-run-id> --log-failed` (if any failure exists in window)
- **Secondary hardening owner**: data-pipeline owner to enforce non-null `writer` provenance on every DevTo write path (worker + GHA), so future packets can attribute last-write deterministically.
