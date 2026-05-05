# AGN-1332 [Sprint 1 audit] Data-store dual-write coverage for top-12 keys

Date: 2026-05-05  
Owner lane: Data Pipeline

## Mandatory opening + freshness gate

- Mandatory opening bundle re-read in this heartbeat: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` result in this workspace:
  - `tsx is not recognized as an internal or external command`
  - Classification: freshness check could not execute; localhost:3023 status cannot be measured until dependencies are installed (`npm install`).

## Evidence commands

```powershell
npm run freshness:check
```

```powershell
$env:ISSUE_ID='AGN-1332'; node scripts/audit-collector-dual-write-coverage.mjs
```

```powershell
Get-Content -Raw data/collector-dual-write-coverage.json
```

## Top-12 key coverage result

Source artifact: `data/collector-dual-write-coverage.json`.

- `top12KeyCoverage.total`: `12`
- `top12KeyCoverage.covered`: `12`
- `top12KeyCoverage.uncovered`: `0`

Top-12 keys verified covered (writer `writeDataStore(key)` + reader `refreshXxxFromStore`):
1. `trending`
2. `reddit-mentions`
3. `hackernews-repo-mentions`
4. `bluesky-mentions`
5. `devto-mentions`
6. `lobsters-mentions`
7. `twitter-repo-signals`
8. `producthunt-launches`
9. `npm-packages`
10. `huggingface-trending`
11. `arxiv-recent`
12. `funding-news`

## Notes

- Script-level matrix still reports 6 uncovered workflow scripts; these are snapshot/verification/index workflows that are not collector writers.
- Append-only JSONL behavior was not modified in this heartbeat.
