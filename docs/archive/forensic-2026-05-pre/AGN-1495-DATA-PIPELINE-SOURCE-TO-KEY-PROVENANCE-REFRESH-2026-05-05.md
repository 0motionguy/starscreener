# AGN-1495 [Sprint 1 audit] Data Pipeline source-to-key provenance refresh

Date: 2026-05-05  
Owner lane: Data Pipeline

## Mandatory opening + freshness gate

- Mandatory opening bundle re-read in this heartbeat: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` result at `2026-05-05T01:18:39.736Z`:
  - localhost `http://localhost:3023` is reachable (not missing)
  - classification: product stale/degraded (`green=21`, `yellow=11`, `red=2`, `dead=16`, `blocking_non_green=24`)

## Evidence commands

```powershell
npm run freshness:check
```

```powershell
$env:ISSUE_ID='AGN-1495'; node scripts/audit-collector-dual-write-coverage.mjs
Get-Content -Raw data/collector-dual-write-coverage.json
```

```powershell
rg -n "writer|runId|commit|lastWriter|lastWriterRunId|lastWriterCommit" scripts/_data-store-write.mjs src/lib/data-store.ts src/app/api/cron/freshness/state/route.ts apps/trendingrepo-worker/src/lib/redis.ts apps/trendingrepo-worker/src/run.ts
```

## Provenance refresh results

Source artifact: `data/collector-dual-write-coverage.json` (refreshed in this heartbeat).

- `issue`: `AGN-1495`
- `generatedAt`: `2026-05-05T01:19:37.147Z`
- `workflowsScanned`: `41`
- `scriptsScanned`: `37`
- `covered`: `37`
- `uncovered`: `0`
- `top12KeyCoverage`: `12/12 covered` (`uncovered=0`)

Top-12 source-to-key rows verified by the matrix include:
- `trending` <- `scripts/scrape-trending.mjs` -> `refreshTrendingFromStore`
- `reddit-mentions` <- `scripts/scrape-reddit.mjs` -> `refreshRedditMentionsFromStore`
- `hackernews-repo-mentions` <- `scripts/scrape-hackernews.mjs` -> `refreshHackernewsMentionsFromStore`
- `bluesky-mentions` <- `scripts/scrape-bluesky.mjs` -> `refreshBlueskyMentionsFromStore`
- `devto-mentions` <- `scripts/scrape-devto.mjs` -> `refreshDevtoMentionsFromStore`
- `lobsters-mentions` <- `scripts/scrape-lobsters.mjs` -> `refreshLobstersMentionsFromStore`
- `twitter-repo-signals` <- `scripts/collect-twitter-signals.ts` -> `refreshTwitterSignalsFromStore`
- `producthunt-launches` <- `scripts/scrape-producthunt.mjs` -> `refreshProducthuntLaunchesFromStore`
- `npm-packages` <- `scripts/scrape-npm.mjs` -> `refreshNpmFromStore`
- `huggingface-trending` <- `scripts/scrape-huggingface.mjs` -> `refreshHfModelsFromStore`
- `arxiv-recent` <- `scripts/scrape-arxiv.mjs` -> `refreshArxivFromStore`
- `funding-news` <- `scripts/scrape-funding-news.mjs` -> `refreshFundingNewsFromStore`

## Writer provenance plumbing verification

`grep` evidence confirms writer/run metadata is present end-to-end:

- Collector writer metadata stamping: `scripts/_data-store-write.mjs` (`writer`, `runId`, `commit`)
- App data-store provenance fields and merge path: `src/lib/data-store.ts`
- Worker-side provenance stamping: `apps/trendingrepo-worker/src/lib/redis.ts` + `apps/trendingrepo-worker/src/run.ts`
- Freshness API exposure of provenance fields: `src/app/api/cron/freshness/state/route.ts` (`lastWriter`, `lastWriterRunId`, `lastWriterCommit`)

## Acceptance summary for AGN-1495

- Freshness status measured, not guessed: yes (localhost reachable; product stale/degraded).
- Source-to-key provenance refresh completed with current repo state: yes.
- Redis/file dual-write behavior preserved in audited collector surfaces: yes (`37/37`, uncovered `0`).
- Append-only JSONL behavior unchanged in this heartbeat: yes (no JSONL writer changes).
