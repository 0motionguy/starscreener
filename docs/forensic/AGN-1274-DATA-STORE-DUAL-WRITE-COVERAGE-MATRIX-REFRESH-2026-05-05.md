# AGN-1274 [Sprint 1 audit] Data-store dual-write coverage matrix refresh

Date: 2026-05-05  
Owner lane: Data Pipeline

## Mandatory opening + freshness gate

- Mandatory opening bundle re-read in this heartbeat: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` result in this heartbeat:
  - `freshness-check: local server not reachable at http://localhost:3023 ... ECONNREFUSED`
  - Classification: localhost `3023` is missing (cannot compute live freshness API rows in this run).

## Top-12 collector dual-write matrix

| Collector | Store key(s) | Writer path evidence | Reader path evidence | Workflow cadence evidence | Missing `writeDataStore` wiring | Stale-key risk |
|---|---|---|---|---|---|---|
| `scrape-trending` | `trending` (+ `trending-lite`, `hot-collections`, `collection-rankings`) | `scripts/scrape-trending.mjs:230` | `src/lib/trending.ts:191` | `.github/workflows/scrape-trending.yml:5` (`7,27,47 * * * *`) | No | High |
| `scrape-reddit` | `reddit-mentions` (+ `reddit-all-posts`) | `scripts/scrape-reddit.mjs:965` | `src/lib/reddit-data.ts:259` | via `scrape-trending` hourly | No | Low |
| `scrape-hackernews` | `hackernews-repo-mentions` (+ `hackernews-trending`) | `scripts/scrape-hackernews.mjs:488` | `src/lib/hackernews.ts:229` | via `scrape-trending` hourly | No | Low |
| `scrape-bluesky` | `bluesky-mentions` (+ `bluesky-trending`) | `scripts/scrape-bluesky.mjs:486` | `src/lib/bluesky.ts:227` | `.github/workflows/scrape-bluesky.yml:5` (`17 * * * *`) | No | Low |
| `scrape-devto` | `devto-mentions` (+ `devto-trending`) | `scripts/scrape-devto.mjs:414` | `src/lib/devto.ts:270` | `.github/workflows/scrape-devto.yml:5` (`18 */6 * * *`) | No | Low |
| `scrape-lobsters` | `lobsters-mentions` (+ `lobsters-trending`) | `scripts/scrape-lobsters.mjs:282` | `src/lib/lobsters.ts:190` | `.github/workflows/scrape-lobsters.yml:9` (`37 * * * *`) | No | High |
| `collect-twitter-signals` | `twitter-repo-signals` (+ `twitter-scans`, `twitter-ingestion-audit`) | `scripts/collect-twitter-signals.ts:956` | `src/lib/twitter/signal-data.ts:86` | `.github/workflows/collect-twitter.yml:5` (`0 */3 * * *`) | No | Critical (`_meta` missing) |
| `scrape-producthunt` | `producthunt-launches` | `scripts/scrape-producthunt.mjs:464` | `src/lib/producthunt.ts:150` | `.github/workflows/scrape-producthunt.yml:5` (`22 11,15,19,23 * * *`) | No | Medium |
| `scrape-npm` | `npm-packages` | `scripts/scrape-npm.mjs:565` | `src/lib/npm.ts:206` | `.github/workflows/scrape-npm.yml:5` (`17 9 * * *`) | No | High |
| `scrape-huggingface` | `huggingface-trending` | `scripts/scrape-huggingface.mjs:257` | `src/lib/huggingface.ts:131` | `.github/workflows/scrape-huggingface.yml:9` (`13 */6 * * *`) | No | Medium |
| `scrape-funding-news` | `funding-news` | `scripts/scrape-funding-news.mjs:670` | `src/lib/funding-news.ts:181` | `.github/workflows/collect-funding.yml:4` (`0 */6 * * *`) | No | Critical (`_meta` missing) |
| `scrape-arxiv` | `arxiv-recent` | `scripts/scrape-arxiv.mjs:262` | `src/lib/arxiv.ts:227` | `.github/workflows/scrape-arxiv.yml:11` (`43 */3 * * *`) | No | Medium |

## Full coverage scan output

Source artifact: `data/collector-dual-write-coverage.json`.

- `issue`: `AGN-1274`
- `workflowsScanned`: `41`
- `scriptsScanned`: `37`
- `covered`: `31`
- `uncovered`: `6`

Uncovered scripts from automated scan:
1. `scripts/build-repo-autocompletion-checklist.mjs`
2. `scripts/promote-unknown-mentions.mjs`
3. `scripts/snapshot-consensus.ts`
4. `scripts/snapshot-top10-sparklines.ts`
5. `scripts/snapshot-top10.ts`
6. `scripts/verify-repo-profile-coverage.mjs`

Interpretation: uncovered entries are snapshot/verification/index tasks, not collector dual-write writers.

## Minimal follow-up issue proposals

1. `Twitter meta sidecar gap` (owner: Data Pipeline Engineer).
2. `Funding meta sidecar gap` (owner: Data Pipeline Engineer).
3. `High-staleness top-line sources` (owner: Release SRE + Data Pipeline).
4. `Automated matrix gate for dual-write` (owner: Platform Engineer).

## Acceptance summary for AGN-1274

- Collector -> store key -> writer path list (top 12): complete.
- Missing `writeDataStore` wiring flags: complete (top 12 none missing; full scan shows 6 non-collector uncovered scripts).
- Stale-key risk by severity: complete.
- Minimal follow-up issue proposals with owner: complete.
