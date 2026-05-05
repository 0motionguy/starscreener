# AGN-1193 [Sprint 1 audit] Data Pipeline dual-write provenance matrix refresh (top 10 sources)

Date: 2026-05-05  
Owner lane: Data Pipeline

## Mandatory opening + freshness gate

- Mandatory opening bundle re-read in this heartbeat: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` result:
  - `GET http://localhost:3023/api/health?soft=1 failed: HTTP 500 Internal Server Error`
  - Classification: localhost `3023` is reachable (not missing), product is stale/degraded.

## Evidence commands

```powershell
npm run freshness:check
```

```powershell
rg -n "writeDataStore\(" scripts/scrape-trending.mjs scripts/scrape-reddit.mjs scripts/scrape-hackernews.mjs scripts/scrape-bluesky.mjs scripts/scrape-devto.mjs scripts/scrape-lobsters.mjs scripts/collect-twitter-signals.ts scripts/scrape-producthunt.mjs scripts/scrape-npm.mjs scripts/scrape-huggingface.mjs
```

```powershell
rg -n -e "export async function refreshTrendingFromStore" -e "export async function refreshRedditMentionsFromStore" -e "export async function refreshHackernewsMentionsFromStore" -e "export async function refreshBlueskyMentionsFromStore" -e "export async function refreshDevtoMentionsFromStore" -e "export async function refreshLobstersMentionsFromStore" -e "export async function refreshTwitterSignalsFromStore" -e "export async function refreshProducthuntLaunchesFromStore" -e "export async function refreshNpmFromStore" -e "export async function refreshHfModelsFromStore" src/lib src/lib/twitter
```

```powershell
rg -n "cron:|run: node scripts/scrape|run: npm run collect:twitter" .github/workflows/scrape-trending.yml .github/workflows/scrape-bluesky.yml .github/workflows/scrape-devto.yml .github/workflows/scrape-lobsters.yml .github/workflows/collect-twitter.yml .github/workflows/scrape-producthunt.yml .github/workflows/scrape-npm.yml .github/workflows/scrape-huggingface.yml
```

## Top-10 provenance matrix (refreshed)

| Source | Writer evidence (dual-write key) | Reader refresh hook | Workflow cadence evidence | Dual-write status |
|---|---|---|---|---|
| Trending | `scripts/scrape-trending.mjs:227` (`writeDataStore("trending", ...)`) | `src/lib/trending.ts:191` | `.github/workflows/scrape-trending.yml:5` (`7,27,47 * * * *`) | Covered |
| Reddit mentions | `scripts/scrape-reddit.mjs:965` (`writeDataStore("reddit-mentions", ...)`) | `src/lib/reddit-data.ts:259` | `.github/workflows/scrape-trending.yml:60` (reddit step under hourly trending workflow) | Covered |
| Hacker News mentions | `scripts/scrape-hackernews.mjs:488` (`writeDataStore("hackernews-repo-mentions", ...)`) | `src/lib/hackernews.ts:229` | `.github/workflows/scrape-trending.yml:69` (HN step under hourly trending workflow) | Covered |
| Bluesky mentions | `scripts/scrape-bluesky.mjs:486` (`writeDataStore("bluesky-mentions", ...)`) | `src/lib/bluesky.ts:227` | `.github/workflows/scrape-bluesky.yml:5` (`17 * * * *`) | Covered |
| Dev.to mentions | `scripts/scrape-devto.mjs:414` (`writeDataStore("devto-mentions", ...)`) | `src/lib/devto.ts:270` | `.github/workflows/scrape-devto.yml:5` (`18 */6 * * *`) | Covered |
| Lobsters mentions | `scripts/scrape-lobsters.mjs:282` (`writeDataStore("lobsters-mentions", ...)`) | `src/lib/lobsters.ts:190` | `.github/workflows/scrape-lobsters.yml:5` (`37 * * * *`) | Covered |
| Twitter signals | `scripts/collect-twitter-signals.ts:787` (`writeDataStore("twitter-repo-signals", ...)`) | `src/lib/twitter/signal-data.ts:86` | `.github/workflows/collect-twitter.yml:5` (`0 */3 * * *`) | Covered |
| ProductHunt launches | `scripts/scrape-producthunt.mjs:464` (`writeDataStore("producthunt-launches", ...)`) | `src/lib/producthunt.ts:150` | `.github/workflows/scrape-producthunt.yml:5` (`22 11,15,19,23 * * *`) | Covered |
| NPM packages | `scripts/scrape-npm.mjs:565` (`writeDataStore("npm-packages", ...)`) | `src/lib/npm.ts:206` | `.github/workflows/scrape-npm.yml:5` (`17 9 * * *`) | Covered |
| HuggingFace models | `scripts/scrape-huggingface.mjs:257` (`writeDataStore("huggingface-trending", ...)`) | `src/lib/huggingface.ts:131` | `.github/workflows/scrape-huggingface.yml:9` (`13 */6 * * *`) | Covered |

## Provenance interpretation

- All top-10 sources in this matrix have explicit collector-side `writeDataStore(...)` calls and corresponding server-side `refreshXxxFromStore()` hooks, preserving Redis/file dual-write behavior with data-store read path compliance.
- No source in this top-10 set is file-only; each has a Redis-key writer path verified from the collector script.
