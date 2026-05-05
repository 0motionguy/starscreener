# AGN-1030 Sprint 1 audit — Collector dual-write provenance matrix (2026-05-05)

Issue: AGN-1030  
Owner lane: Data Pipeline

## Mandatory opening + freshness gate

- Mandatory opening bundle re-read in this heartbeat: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` result: localhost `http://localhost:3023` reachable (not missing), but freshness endpoint failed with `HTTP 500 Internal Server Error` on `/api/cron/freshness/state`.

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
- Dual-write covered (`import ./_data-store-write.mjs` + `writeDataStore(...)`): 31
- Uncovered: 6

Uncovered scripts:
1. `scripts/build-repo-autocompletion-checklist.mjs`
2. `scripts/promote-unknown-mentions.mjs`
3. `scripts/snapshot-consensus.ts`
4. `scripts/snapshot-top10-sparklines.ts`
5. `scripts/snapshot-top10.ts`
6. `scripts/verify-repo-profile-coverage.mjs`

Interpretation: these six are workflow-invoked but are not collector dual-write writers through `scripts/_data-store-write.mjs`; they are snapshot/verification/index tasks.

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

## AGN-1030 acceptance status

- Freshness status measured from command evidence: done.
- Dual-write/provenance matrix generated from live repo state: done.
- Remaining risk: freshness endpoint is currently HTTP 500, so runtime visibility path is degraded even though provenance plumbing exists in writer/read paths.
