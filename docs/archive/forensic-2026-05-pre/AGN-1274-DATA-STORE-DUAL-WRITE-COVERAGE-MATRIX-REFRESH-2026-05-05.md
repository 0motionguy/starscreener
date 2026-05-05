# AGN-1274 [Sprint 1 audit] Data-store dual-write coverage matrix refresh

Date: 2026-05-05  
Owner lane: Data Pipeline

## Mandatory opening + freshness gate

- Mandatory opening bundle re-read in this heartbeat: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` result:
  - `GET http://localhost:3023/api/cron/freshness/state failed: HTTP 500 Internal Server Error`
  - Classification: localhost `3023` is reachable (not missing), product is stale/degraded.

## Evidence commands

```powershell
npm run freshness:check
```

```powershell
$env:ISSUE_ID='AGN-1274'; node scripts/audit-collector-dual-write-coverage.mjs
```

```powershell
rg -n "writer|runId|commit|lastWriter|writeDataStore\(" scripts/_data-store-write.mjs src/lib/data-store.ts src/app/api/cron/freshness/state/route.ts apps/trendingrepo-worker/src/lib/redis.ts apps/trendingrepo-worker/src/run.ts
```

## Matrix output (refreshed)

Source artifact: `data/collector-dual-write-coverage.json`.

- `issue`: `AGN-1274`
- `generatedAt`: `2026-05-04T21:47:17.739Z`
- `workflowsScanned`: `41`
- `scriptsScanned`: `37`
- `covered`: `31`
- `uncovered`: `6`

Uncovered scripts in current scan:
1. `scripts/build-repo-autocompletion-checklist.mjs`
2. `scripts/promote-unknown-mentions.mjs`
3. `scripts/snapshot-consensus.ts`
4. `scripts/snapshot-top10-sparklines.ts`
5. `scripts/snapshot-top10.ts`
6. `scripts/verify-repo-profile-coverage.mjs`

Interpretation: the six uncovered scripts are snapshot/verification/index workflows, not collector writers; they do not import `scripts/_data-store-write.mjs` and do not call `writeDataStore(...)`.

## Writer-provenance plumbing verification

- Collector lane provenance is preserved in `scripts/_data-store-write.mjs` via `writer`, `runId`, `commit` meta serialization.
- App/server lane provenance is preserved in `src/lib/data-store.ts` (`WriteMetaInfo` and provenance merge).
- Worker lane provenance is preserved in `apps/trendingrepo-worker/src/run.ts` + `apps/trendingrepo-worker/src/lib/redis.ts` (`writer: worker:<fetcher>`).
- Freshness API exposes provenance fields in `src/app/api/cron/freshness/state/route.ts` via `lastWriter`, `lastWriterRunId`, and `lastWriterCommit`.

## Acceptance summary for AGN-1274

- Freshness status measured: yes (endpoint currently 500; localhost reachable).
- Dual-write coverage matrix refreshed from repo state: yes (`data/collector-dual-write-coverage.json`).
- Redis/file dual-write behavior preserved for covered collector scripts: yes.
- Append-only logs untouched in this heartbeat: yes.
