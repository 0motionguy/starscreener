# AGN-882 [FRESH-09] Source coverage matrix — which signals come from which sources

- Timestamp: 2026-05-05
- Owner: Data Pipeline Engineer
- Scope: verified mapping from user-facing signal surfaces -> read key/path -> writer -> workflow cadence

## Mandatory opening + freshness evidence

- Mandatory opening docs re-read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` result on this heartbeat:
  - `GET http://localhost:3023/api/health?soft=1 failed: HTTP 500 Internal Server Error`
  - Classification: localhost `3023` is reachable (not missing), product is stale/degraded.

## Verified source coverage matrix (code-first, not memory)

| Signal surface | Read path (source-of-truth reader) | Writer key/path | Collector entrypoint | Workflow + cadence |
|---|---|---|---|---|
| Trending repos (`/`, `/breakouts`, `/top10` dependencies) | `src/lib/trending.ts` imports `data/trending.json` + refreshes via `refreshTrendingFromStore()` | `writeDataStore("trending", ...)` | `scripts/scrape-trending.mjs` | `.github/workflows/scrape-trending.yml` (`7,27,47 * * * *`) |
| Reddit mentions (`/reddit`, cross-signal pages) | `src/lib/reddit-data.ts` + `refreshRedditMentionsFromStore()` | `writeDataStore("reddit-mentions", ...)` and `reddit-all-posts` | `scripts/scrape-reddit.mjs` (called from trending workflow lane) | `.github/workflows/scrape-trending.yml` (`7,27,47 * * * *`) |
| Hacker News mentions (`/hackernews/trending`) | `src/lib/hackernews.ts` imports `data/hackernews-repo-mentions.json` + `refreshHackernewsMentionsFromStore()` | `writeDataStore("hackernews-repo-mentions", ...)` | `scripts/scrape-hackernews.mjs` (called from trending workflow lane) | `.github/workflows/scrape-trending.yml` (`7,27,47 * * * *`) |
| Bluesky mentions (`/bluesky/trending`) | `src/lib/bluesky.ts` imports `data/bluesky-mentions.json` + `refreshBlueskyMentionsFromStore()` | `writeDataStore("bluesky-mentions", ...)` | `scripts/scrape-bluesky.mjs` | `.github/workflows/scrape-bluesky.yml` (`17 * * * *`) |
| Dev.to mentions (`/devto`) | `src/lib/devto.ts` imports `data/devto-mentions.json` + `refreshDevtoMentionsFromStore()` | `writeDataStore("devto-mentions", ...)` | `scripts/scrape-devto.mjs` | `.github/workflows/scrape-devto.yml` (`18 */6 * * *`) |
| Lobsters mentions (`/lobsters`) | `src/lib/lobsters.ts` imports `data/lobsters-mentions.json` + `refreshLobstersMentionsFromStore()` | `writeDataStore("lobsters-mentions", ...)` | `scripts/scrape-lobsters.mjs` | `.github/workflows/scrape-lobsters.yml` (`37 * * * *`) |
| Twitter/X (`/twitter`, twitter APIs) | `src/lib/twitter/signal-data.ts` + `refreshTwitterSignalsFromStore()` (used by `src/app/twitter/page.tsx`) | `writeDataStore("twitter-repo-signals"|"twitter-scans"|"twitter-ingestion-audit", ...)` mirrored from `.data/twitter-*.jsonl` | `scripts/collect-twitter-signals.ts` | `.github/workflows/collect-twitter.yml` (`0 */3 * * *`) |
| ProductHunt launches (`/producthunt`) | `src/lib/producthunt.ts` imports `data/producthunt-launches.json` + `refreshProducthuntLaunchesFromStore()` | `writeDataStore("producthunt-launches", ...)` | `scripts/scrape-producthunt.mjs` | `.github/workflows/scrape-producthunt.yml` (`22 11,15,19,23 * * *`) |
| NPM telemetry (`/npm`) | `src/lib/npm.ts` imports `data/npm-packages.json` + `refreshNpmFromStore()` | `writeDataStore("npm-packages", ...)` | `scripts/scrape-npm.mjs` | `.github/workflows/scrape-npm.yml` (`17 9 * * *`) |
| HuggingFace models | `src/lib/huggingface.ts` imports `data/huggingface-trending.json` + `refreshHfModelsFromStore()` | `writeDataStore("huggingface-trending", ...)` | `scripts/scrape-huggingface.mjs` | `.github/workflows/scrape-huggingface.yml` (`13 */6 * * *`) |
| HuggingFace datasets | `src/lib/hf-datasets.ts` imports `data/huggingface-datasets.json` + `refreshHfDatasetsFromStore()` | `writeDataStore("huggingface-datasets", ...)` | `scripts/scrape-huggingface-datasets.mjs` | `.github/workflows/scrape-huggingface-datasets.yml` (`25 */6 * * *`) |
| HuggingFace spaces | `src/lib/hf-spaces.ts` imports `data/huggingface-spaces.json` + `refreshHfSpacesFromStore()` | `writeDataStore("huggingface-spaces", ...)` | `scripts/scrape-huggingface-spaces.mjs` | `.github/workflows/scrape-huggingface-spaces.yml` (`35 */6 * * *`) |
| Funding radar (`/funding`) | `src/lib/funding-news.ts` + `refreshFundingNewsFromStore()` | `writeDataStore("funding-news", ...)` | `scripts/scrape-funding-news.mjs` | `.github/workflows/collect-funding.yml` (`0 */6 * * *`) |
| arXiv papers (`/arxiv/trending`, `/papers`) | `src/lib/arxiv.ts` imports `data/arxiv-recent.json` + `refreshArxivFromStore()` | `writeDataStore("arxiv-recent", ...)` | `scripts/scrape-arxiv.mjs` | `.github/workflows/scrape-arxiv.yml` (`43 */3 * * *`) |
| Collections (`/collections`) | `src/lib/collection-rankings.ts` imports `data/collection-rankings.json` + `refreshCollectionRankingsFromStore()` | `writeDataStore("collection-rankings", ...)` | `scripts/scrape-trending.mjs` (collection rankings section) | `.github/workflows/refresh-collection-rankings.yml` (`17 */6 * * *`) |
| Revenue overlays (`/revenue`) | `src/lib/revenue-overlays.ts` + `refreshRevenueOverlaysFromStore()` and `src/lib/revenue-startups.ts` + `refreshRevenueStartupsFromStore()` | `writeDataStore("revenue-overlays", ...)` and `writeDataStore("trustmrr-startups", ...)` | `scripts/sync-trustmrr.mjs` | `.github/workflows/sync-trustmrr.yml` (daily + hourly incremental cron entries) |

## Data-store fallback truth (verified)

`src/lib/data-store.ts` confirms a 3-tier read chain and masked degradation:

1. Redis tier (`source: "redis"`).
2. File tier (`source: "file"`).
3. In-memory last-known-good (`source: "memory"`).

If all miss, reader returns `source: "missing"` and non-fresh status; collectors use `scripts/_data-store-write.mjs` for Redis dual-write with graceful skip when Redis env is missing.

## Notes for AGN-882 closure criteria

- This matrix intentionally uses live grep/code paths, not older audit assertions.
- Twitter lane is documented as dual-path (`.data/*.jsonl` persistence + `writeDataStore` mirror keys) to make drift checks explicit.
