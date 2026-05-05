# AGN-1030 Sprint 1 audit — Collector dual-write provenance matrix (2026-05-05)

Issue: AGN-1030  
Owner lane: Data Pipeline

## Mandatory opening + freshness gate

- Mandatory opening bundle re-read in this heartbeat: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` result in this continuation: localhost `http://localhost:3023` is missing (`ECONNREFUSED`).

## Evidence commands

```powershell
$env:ISSUE_ID='AGN-1030'; node scripts/audit-collector-dual-write-coverage.mjs
```

```powershell
rg -n "writer|runId|commit|writeDataStore|setCurrentFetcherName|lastWriter" scripts/_data-store-write.mjs src/lib/data-store.ts src/app/api/cron/freshness/state/route.ts apps/trendingrepo-worker/src/lib/redis.ts apps/trendingrepo-worker/src/run.ts
```

## Matrix summary (workflow-invoked `scripts/*`)

Source artifact: `data/collector-dual-write-coverage.json` (`issue: "AGN-1030"`).

- Workflows scanned: 41
- Scripts scanned: 37
- Dual-write covered: 37
- Uncovered: 0

Interpretation: current repo state shows all workflow-invoked scripts in scope satisfy dual-write detection.

## Provenance coverage (writer attribution)

Verified in code:

1. Script lane writer metadata
   - `scripts/_data-store-write.mjs` writes meta as JSON when provenance fields exist:
     - `writer` from `GITHUB_WORKFLOW` (`github-actions:<workflow>`)
     - `runId` from `GITHUB_RUN_ID`
     - `commit` from `GITHUB_SHA` (short SHA)

2. App/server lane writer metadata
   - `src/lib/data-store.ts` supports `{ writtenAt, writer?, runId?, commit? }` and resolves provenance from env/options.

3. Worker lane writer metadata
   - `apps/trendingrepo-worker/src/run.ts` sets current fetcher context per run.
   - `apps/trendingrepo-worker/src/lib/redis.ts` maps that context to `writer: worker:<fetcher>` and writes provenance JSON meta.

4. Freshness API exposure
   - `src/app/api/cron/freshness/state/route.ts` parses writer meta and exposes `lastWriter`, `lastWriterRunId`, `lastWriterCommit`.

## Drift keys and source-of-truth recommendations

Per-key overlap evidence was verified from both script lane (`scripts/*`) and worker lane (`apps/trendingrepo-worker/src/fetchers/*`) plus schedules in workflow cron + worker `schedule`.

1. `collection-rankings`
   - Script writer: `scripts/scrape-trending.mjs` -> `writeDataStore("collection-rankings", ...)`
   - Worker writer: `apps/trendingrepo-worker/src/fetchers/collection-rankings/index.ts` -> `writeDataStore('collection-rankings', ...)`
   - Cadence overlap: both at `17 */6 * * *`
   - Recommendation: worker primary, workflow fallback/manual only.

2. `trending`, `hot-collections`
   - Script writer: `scripts/scrape-trending.mjs` -> `writeDataStore("trending"...), writeDataStore("hot-collections"...)`
   - Worker writer: `apps/trendingrepo-worker/src/fetchers/oss-trending/index.ts` -> same keys
   - Cadence overlap: script `7,27,47 * * * *` vs worker `22 * * * *`
   - Recommendation: worker primary, script lane as file-seed/backfill only.

3. `devto-mentions`, `devto-trending`
   - Script writer: `scripts/scrape-devto.mjs`
   - Worker writer: `apps/trendingrepo-worker/src/fetchers/devto/index.ts`
   - Cadence overlap: script `18 */6 * * *` vs worker `30 8 * * *`
   - Recommendation: worker primary to eliminate dual-writer ambiguity; keep script as break-glass.

4. `reddit-mentions`, `reddit-all-posts`
   - Script writer: `scripts/scrape-reddit.mjs` (mentions confirmed; all-posts written in same script path)
   - Worker writer: `apps/trendingrepo-worker/src/fetchers/reddit/index.ts` -> both keys
   - Cadence overlap: script via `scrape-trending.yml` (`7,27,47 * * * *`) vs worker `30 * * * *`
   - Recommendation: worker primary, script secondary fallback.

5. `producthunt-launches`
   - Script writer: `scripts/scrape-producthunt.mjs`
   - Worker writer: `apps/trendingrepo-worker/src/fetchers/producthunt/index.ts`
   - Cadence overlap: script `22 11,15,19,23 * * *` vs worker `0 11,15,19,23 * * *`
   - Recommendation: worker primary; keep script off-by-default fallback.

6. `revenue-overlays`, `trustmrr-startups`
   - Script writer: `scripts/sync-trustmrr.mjs`
   - Worker writer: `apps/trendingrepo-worker/src/fetchers/trustmrr/index.ts`
   - Cadence overlap: script `27 2 * * *` + hourly incremental (`27 ...`) vs worker `27 * * * *`
   - Recommendation: worker primary; script lane should run only for recovery/backfill.

## AGN-1030 acceptance status

- Freshness status measured from command evidence: done.
- Dual-write/provenance matrix generated from live repo state: done.
- Drift keys with per-key single-writer recommendation + rationale: done.
- Remaining blocker for runtime validation: localhost `3023` missing (`ECONNREFUSED`) in this continuation heartbeat.
