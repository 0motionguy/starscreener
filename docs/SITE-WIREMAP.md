# SITE-WIREMAP.md — Frontend → Data → Collector → External API

**Purpose**: every user-facing route in the site, mapped to the data-store key it reads, the collector that populates that key, the cron schedule, and the external API at the source. Sister doc to [ENGINE.md](ENGINE.md) (which catalogues the engine bottom-up by service); this one walks **top-down from the menu**.

**Read-order**: when a route looks broken, look it up here, find its collector, then check `data/_meta/<key>.json` (last-write timestamp) and the matching workflow run on GitHub Actions.

**Last refreshed**: 2026-05-02

---

## 1. Sidebar navigation — 7 sections, 40 nav items

[src/components/layout/SidebarContent.tsx](../src/components/layout/SidebarContent.tsx) defines the menu structure. Sections in render order (post-`7bf5a747` sidebar trim):

1. **TREND TERMINAL** — Trending Repos / Trending Skills / Trending MCP / Breakouts / Consensus
2. **SIGNAL TERMINAL** — Market Signals / Hacker News / Lobsters / Dev.to / Bluesky / Reddit / X (Twitter) / Product Hunt
3. **LLM / PACK TERMINAL** — NPM Packages / HF Models / HF Datasets / HF Spaces
4. **LAUNCH TERMINAL** — Funding Radar / Revenue / Agent Commerce
5. **RESEARCH TERMINAL** — arXiv Papers / Cited Repos
6. **EXPLORE** — Digest / Ideas / Collections
7. **TOOLS** — Watchlist / Compare / Tier List / MindShare / Top 10
8. **WATCHING** — top 5 watchlist preview cards (user-state)

**Orphaned but URL-reachable** (kept on disk, removed from sidebar in `7bf5a747` and prior trims): `/top` (Top 100), `/predict`, `/categories`, `/categories/[slug]`, `/pricing` (Plans), `/model-usage` (LLM Charts), `/agent-repos` (Trending AGNT), `/tools/revenue-estimate` (Revenue Tool), `/submit/revenue` (Drop Revenue). BACKLOG AGN-63 tracks the keep-vs-retire decision.

Routes NOT in the sidebar but addressable: `/u/[handle]`, `/repo/[owner]/[name]`, `/repo/[owner]/[name]/star-activity`, `/search`, `/alerts`, `/alerts/new`, `/submit`, `/submit/revenue`, `/cli`, `/portal/docs`, `/pricing`, `/digest/[date]`, `/agent-commerce/[slug]`, `/agent-commerce/facilitator/[name]`, `/agent-repos/[slug]`, `/skills/[slug]`, `/categories/[slug]`, `/collections/[slug]`, `/consensus/[owner]/[name]`, `/mcp/[slug]`, `/ideas/[id]`, `/tierlist/[shortId]`, `/s/[shortId]`, `/embed/top10`, `/demo`, `/design-lab/primitives`, `/admin/*` (8 admin routes), `/you`.

**Total user-facing pages**: 78 page.tsx files (all have error.tsx + most have loading.tsx after this session's PROD-1 wave).

---

## 2. The 5 data-fan-out functions

Most pages don't read raw collector output — they read derived/joined views. Five fan-out points absorb 95% of the engine's signal surface:

| Function | Source file | Reads from | Used by routes |
|---|---|---|---|
| `getDerivedRepos()` | [src/lib/derived-repos.ts](../src/lib/derived-repos.ts) | trending + reddit + HN + bluesky + devto + lobsters + npm + HF + arxiv + producthunt + funding + cross-signal + scoring | `/`, `/breakouts`, `/top`, `/predict`, `/agent-repos`, `/mindshare`, `/categories/*`, `/u/[handle]`, `/search` |
| `buildCanonicalRepoProfile()` | [src/lib/api/repo-profile.ts](../src/lib/api/repo-profile.ts) | derived repo + twitter panel + npm packages + PH launch + revenue overlays + funding events + ideas + predictions + reasons + 6 mention synthesizers | `/repo/[owner]/[name]`, `/api/repos/[owner]/[name]?v=2` |
| `getSkillsSignalData()` | [src/lib/ecosystem-leaderboards.ts](../src/lib/ecosystem-leaderboards.ts) | skill-install-snapshot + skill-derivatives + awesome-skills + lobehub + skillsmp + smithery + 24h/7d/30d windows | `/skills`, `/skills/[slug]` |
| `getMcpSignalData()` | same | mcp-smithery + pulsemcp + mcp-dependents + mcp-usage-snapshot + mcp-liveness | `/mcp`, `/mcp/[slug]` |
| `buildConsensus(items)` | [src/lib/signals/consensus.ts](../src/lib/signals/consensus.ts) | hackernews + bluesky + devto rollups | `/signals`, `/consensus` (different surface, same engine) |

**Implication**: when a single collector dies (e.g. Reddit OAuth expires), 9+ routes degrade simultaneously because they all join via `getDerivedRepos()`. This is also why the per-source `_meta/*.json` freshness gate is so valuable — one source dying is a fleet-wide event.

---

## 3. Route-to-data wire map (sidebar order)

### 3a. TREND TERMINAL

| Route | Reads | Collector | Cron | External API |
|---|---|---|---|---|
| `/` (Trending Repos) | `getDerivedRepos()` + `lastFetchedAt` (trending) | scrape-trending → `data/trending.json` | hourly `27 * * * *` | OSS Insight (`api.ossinsight.io/v1/trends/repos/`) |
| `/consensus` | consensus payload via factory reader | snapshot-consensus + scoring shadow | daily `55 23 * * *` | derives from internal pipeline, no external |
| `/skills` (Trending Skills) | `getSkillsSignalData()` | refresh-skill-* (5 workflows) + skill-install-snapshot + skill-derivatives | every 6h → daily nightly (post-2026-05-02 cuts) | GitHub API (skills derivative repos), SkillsMP, Smithery, Lobehub, Claude RSS |
| `/mcp` (Trending MCP) | `getMcpSignalData()` | refresh-mcp-smithery-rank + ping-mcp-liveness + refresh-mcp-dependents + refresh-mcp-usage-snapshot | every 6h + daily | Smithery (`smithery.ai/api/...`), PulseMCP (`api.pulsemcp.com/v0/`), npm |
| `/agent-repos` (Trending AGNT) | `getDerivedRepos()` filtered by `agent` topic/tag | trending + scoring | (same as `/`) | OSS Insight |
| `/breakouts` | `getDerivedRepos()` + `getChannelStatus()` (cross-signal) | trending + every mention source (6-channel) | various | OSS Insight + 6 mention APIs |
| `/top` (Top 100) | `getDerivedRepos()` sorted by momentum score | (same fan-out) | (same as `/`) | (same) |

### 3b. SIGNAL TERMINAL

| Route | Reads | Collector | Cron | External API |
|---|---|---|---|---|
| `/signals` (Market Signals) | `hnFetchedAt` + `blueskyFetchedAt` + `devtoFetchedAt` + `buildConsensus` + `buildVolume` | scrape-bluesky + scrape-trending (HN included) + scrape-devto | hourly + 6h | Bluesky, HN-Algolia, Dev.to API |
| `/hackernews/trending` | hackernews-repo-mentions + hackernews-trending payloads | scrape-trending (HN sidecar) | hourly | HN-Algolia (`hn.algolia.com/api/v1`) |
| `/lobsters` | lobsters-mentions + lobsters-trending payloads | scrape-lobsters | hourly | Lobsters (`lobste.rs/...`) |
| `/devto` | devto-mentions + devto-trending payloads | scrape-devto | every 6h | Dev.to (`dev.to/api/articles`) |
| `/bluesky/trending` | bluesky-mentions + bluesky-trending payloads | scrape-bluesky | hourly | Bluesky (`bsky.social/xrpc/`) |
| `/reddit/trending` | reddit-mentions payload | scrape-trending (reddit collector inside) | hourly | Reddit OAuth (`oauth.reddit.com`) |
| `/twitter` (X) | twitter-repo-signals (worker-fetched) | collect-twitter (Apify actor) | every 3h | Apify `apidojo~tweet-scraper` actor |
| `/producthunt` | `getDerivedRepoByFullName` + producthunt payload | scrape-producthunt | 4×/day at PT-cron | ProductHunt GraphQL (`api.producthunt.com/v2/api/graphql`) |

### 3c. LLM / PACK TERMINAL

| Route | Reads | Collector | Cron | External API |
|---|---|---|---|---|
| `/npm` (NPM Packages) | `refreshNpmFromStore()` → npm-trending + npm-downloads | scrape-npm + refresh-npm-downloads | daily + every 6h | npm registry + downloads (`api.npmjs.org/downloads/`) |
| `/huggingface/trending` (HF Models) | `refreshHfModelsFromStore()` | scrape-huggingface | every 3h → 6h (post-2026-05-02 cuts) | HF API (`huggingface.co/api/models`) |
| `/huggingface/datasets` | `refreshHfDatasetsFromStore()` | scrape-huggingface-datasets | every 3h → 6h | HF API (`huggingface.co/api/datasets`) |
| `/huggingface/spaces` | `refreshHfSpacesFromStore()` | scrape-huggingface-spaces | every 3h → 6h | HF API (`huggingface.co/api/spaces`) |
| `/model-usage` (LLM Charts) | model-usage-snapshot via tabbed UI | refresh-mcp-usage-snapshot (despite name, drives LLM charts too) | daily `30 3 * * *` | derived from internal data + Claude RSS via OpenRouter |

### 3d. LAUNCH TERMINAL

| Route | Reads | Collector | Cron | External API |
|---|---|---|---|---|
| `/funding` (Funding Radar) | `refreshFundingNewsFromStore()` | collect-funding (Railway worker fetches) | every 6h | Crunchbase-like via Firecrawl + Coingecko + Dune + Libraries.io |
| `/revenue` | `refreshRevenueStartupsFromStore()` + `refreshRevenueOverlaysFromStore()` | sync-trustmrr (Trustmrr sync nightly) | daily `27 2 * * *` | Trustmrr API (`TRUSTMRR_API_KEY`) |
| `/submit/revenue` (Drop Revenue) | static form → POST to `/api/revenue/claim` | n/a (user submission) | n/a | n/a |
| (Hackathons, Launch nav-only — TBD pages) | placeholder routes | n/a | n/a | n/a |

### 3e. RESEARCH TERMINAL

| Route | Reads | Collector | Cron | External API |
|---|---|---|---|---|
| `/arxiv/trending` (arXiv Papers) | `refreshArxivFromStore()` | scrape-arxiv + enrich-arxiv | every 3h + every 12h (post-cuts) | arXiv OAI-PMH + abstract pages (`arxiv.org/abs/`) |
| `/research` (Cited Repos) | `refreshResearchSignalsFromStore()` | enrich-arxiv + cross-domain joins | every 12h | derived from arxiv + GitHub repo lookup |
| `/papers` | `getArxivRecentFile()` raw file | scrape-arxiv | every 3h | arXiv |

### 3f. EXPLORE

| Route | Reads | Collector | Cron | External API |
|---|---|---|---|---|
| `/digest` (Digest list) | `listAvailableDigestDates()` reads `data/digest/<YYYY-MM-DD>.json` | cron-digest-weekly | weekly Monday 8am | derived snapshot, no external |
| `/digest/[date]` | digest payload for the date | (same) | (same) | (same) |
| `/ideas` | repo-ideas store via Zustand + supabase if wired | user submissions + LLM enrichment via cron-llm | hourly `10 * * * *` | Kimi K2.6 (LLM) — non-default; falls back gracefully |
| `/predict` | `getDerivedRepos()` + repo-predictions store | cron-predictions | daily `0 6 * * *` | derived from internal scoring (LLM-augmented) |
| `/categories` | `getDerivedCategoryStats()` over derived-repos | (same fan-out as `/`) | (same) | (same) |
| `/categories/[slug]` | category snapshot + window deltas | snapshot-category-metrics (W5-CATWINDOW) | hourly | (same) |
| `/collections` | `refreshCollectionRankingsFromStore()` | refresh-collection-rankings | every 6h | OSS Insight (`api.ossinsight.io/v1/collections/`) |
| `/collections/[slug]` | per-collection rank | (same) | (same) | (same) |
| `/pricing` (Plans) | static (Stripe wire-up planned) | n/a | n/a | Stripe (configured, not active) |
| `/tools/revenue-estimate` (Revenue Tool) | derived-repos + revenue overlays + heuristic | (same) | (same) | (same) |

### 3g. TOOLS

| Route | Reads | Collector | Cron | External API |
|---|---|---|---|---|
| `/watchlist` | Zustand `useWatchlistStore` (localStorage) | n/a (client-side state) | n/a | n/a |
| `/compare` | client form → on-demand `githubFetch` to 7 endpoints | n/a (request-time) | n/a | GitHub API direct (pool-aware) |
| `/tierlist` | shared tierlist payloads | user submissions | n/a | n/a |
| `/tierlist/[shortId]` | persisted tierlist via shortId | (same) | n/a | n/a |
| `/mindshare` | `getDerivedRepos()` + `packBubbles()` | (same fan-out) | (same) | (same) |
| `/top10` | `buildLiveTop10PageData()` | snapshot-top10 + snapshot-top10-sparklines | daily `55 23 * * *` + `50 23 * * *` | derived snapshots |
| `/top10/[date]` | date-pinned top10 snapshot | (same) | (same) | (same) |
| `/signals` (Signal Radar — same route as Market Signals above) | (see SIGNAL TERMINAL) | | | |

### 3h. UNLISTED but addressable

| Route | Reads | Collector | Cron | External API |
|---|---|---|---|---|
| `/repo/[owner]/[name]` | `getDerivedRepoByFullName()` + `buildCanonicalRepoProfile()` (11 loaders + 6 synthesizers) | every collector (this is the fan-in point) | every cron | every API |
| `/repo/[owner]/[name]/star-activity` | star-activity time series | refresh-star-activity + append-star-activity | daily `17 3 * * *` | GitHub stargazers API (pool-aware) |
| `/u/[handle]` | `getProfile()` from data-store | enrich-repo-profiles + GitHub user fetch | hourly `41 * * * *` | GitHub user API + derived |
| `/search` | client filter over `getDerivedRepos()` | (same) | (same) | (same) |
| `/alerts` | alert rules + persisted events | cron-aiso-drain | every 30 min | derived (no external) |
| `/alerts/new` | static form → API POST | n/a | n/a | n/a |
| `/submit` | static form (user submission) | promote-unknown-mentions ingest path | daily | derived from lake |
| `/cli` | static docs page | n/a | n/a | n/a |
| `/portal/docs` | static docs (API portal) | n/a | n/a | n/a |
| `/agent-commerce/*` | agent-commerce signal data | cron-agent-commerce | daily `31 4 * * *` | derived (LLM-augmented) |
| `/embed/top10` | iframe-friendly Top10 | (same as `/top10`) | (same) | (same) |
| `/admin/*` (8 routes) | server-state snapshots | n/a (admin views, no collectors) | n/a | n/a |
| `/admin/pool` | per-process GitHub pool snapshot | n/a (live in-memory) | n/a | n/a |
| `/admin/pool-aggregate` | Redis-aggregate fleet view (POOL-REDIS) | every `recordRateLimit` writes to Redis | live | n/a |
| `/admin/staleness` | per-source freshness | reads `data/_meta/*.json` | live | n/a |
| `/admin/scoring-shadow` | shadow-scoring run results | run-shadow-scoring | daily `0 2 * * *` | n/a |

---

## 4. Reverse map — every collector and what surfaces depend on it

| Collector / Workflow | Cron | Output key | Surfaces breaking on failure |
|---|---|---|---|
| scrape-trending | hourly `27 * * * *` | `data/trending.json` | `/`, `/breakouts`, `/top`, `/predict`, `/agent-repos`, `/mindshare`, `/categories/*`, `/u/[handle]`, `/search`, `/repo/*`, every derived-repos consumer |
| scrape-bluesky | hourly `17 * * * *` | bluesky-mentions, bluesky-trending | `/bluesky/trending`, `/signals`, breakouts cross-signal `bluesky` channel |
| scrape-lobsters | hourly `37 * * * *` | lobsters-mentions, lobsters-trending | `/lobsters`, repo profile lobsters synth, breakouts |
| scrape-devto | every 6h | devto-mentions, devto-trending | `/devto`, `/signals`, breakouts `devto` channel |
| scrape-arxiv + enrich-arxiv | every 3h + every 12h | arxiv-recent | `/arxiv/trending`, `/research`, `/papers`, repo profile arxiv synth |
| scrape-huggingface (×3) | every 6h (post-cuts) | huggingface-*, huggingface-datasets, huggingface-spaces | `/huggingface/*`, repo profile HF synth |
| scrape-npm + refresh-npm-downloads | daily + every 6h | npm-trending, npm-downloads | `/npm`, repo profile npm synth |
| scrape-producthunt | 4×/day | producthunt-launches | `/producthunt`, repo profile PH synth |
| collect-twitter | every 3h | `.data/twitter-*.jsonl` + new `data/_meta/twitter.json` | `/twitter`, repo profile twitter panel + synth, breakouts `twitter` channel |
| collect-funding | every 6h | funding-news, funding-events | `/funding`, repo profile funding events |
| sync-trustmrr | daily `27 2 * * *` | revenue-overlays, revenue-startups | `/revenue`, `/tools/revenue-estimate`, repo profile revenue overlays |
| refresh-skill-* (5 workflows, post-cuts → nightly) | nightly | skill-* | `/skills`, `/skills/[slug]` |
| refresh-mcp-* (4 workflows) | every 6h + daily | mcp-* | `/mcp`, `/mcp/[slug]` |
| refresh-collection-rankings | every 6h | collection-rankings | `/collections`, `/collections/[slug]` |
| snapshot-stars (NEW Phase 2) | hourly within scrape-trending | `star-snapshot:24h/7d/30d` | `/api/pipeline/deltas` (consumer of all delta-rendering surfaces) |
| snapshot-category-metrics (NEW W5-CATWINDOW) | hourly within scrape-trending | `category-metrics-snapshot:24h/7d/30d` | `/categories/[slug]` window tabs |
| skill-install-snapshot (NEW W5-SKILLS24H) | daily 03:00 UTC | `skill-install-snapshot:prev:1d/7d/30d` | `/skills` window tabs |
| snapshot-top10 + snapshot-top10-sparklines | daily 23:50–55 | top10 daily snapshot | `/top10`, `/top10/[date]`, `/embed/top10` |
| snapshot-consensus | daily `55 23 * * *` | consensus snapshot | `/consensus`, `/consensus/[owner]/[name]` |
| run-shadow-scoring | daily `0 2 * * *` | scoring-shadow report | `/admin/scoring-shadow` |
| sweep-staleness | daily `0 2 * * *` | staleness report | `/admin/staleness` |
| promote-unknown-mentions | daily `30 4 * * *` | `data/unknown-mentions-promoted.json` | `/admin/unknown-mentions` |
| enrich-repo-profiles | hourly `41 * * * *` | repo-profiles | `/u/[handle]`, repo profile completeness |
| refresh-star-activity + append-star-activity | daily `17 3 * * *` | star-activity time series | `/repo/[owner]/[name]/star-activity` |
| cron-llm | hourly `10 * * * *` | LLM-enriched fields on ideas / predictions | `/ideas`, `/predict` |
| cron-pipeline-ingest | every 2h `15 */2 * * *` | mention-store hydrate | repo profile recent mentions feed |
| cron-pipeline-persist | every 6h `30 */6 * * *` | mention-store persist | (same) |
| cron-pipeline-cleanup | daily `0 4 * * *` | mention-store pruning | (same) |
| cron-pipeline-rebuild | weekly `0 5 * * 0` | full rebuild | recovery only — never user-facing |
| cron-predictions | daily `0 6 * * *` | predictions store | `/predict` |
| cron-agent-commerce | daily `31 4 * * *` | agent-commerce signal data | `/agent-commerce/*` |
| cron-digest-weekly | Mon 8am | weekly digest | `/digest`, `/digest/[date]`, email digest via Resend |
| cron-twitter-outbound | daily `0 14 * * *` | twitter-outbound-runs.jsonl | (worker side, replies / outbound reach) |
| cron-webhooks-flush | every 30 min | webhook delivery | (server-side only) |
| cron-aiso-drain | every 30 min | alert events delivery | `/alerts` events |
| cron-mcp-usage-rotate | monthly day 1 | mcp-usage rolling window rotate | `/model-usage` |
| ping-mcp-liveness | every 6h | mcp-liveness | `/mcp` liveness pill |
| sentry-fix-bot | manual | Sentry-driven fix PR | dev workflow only |
| trendingrepo-worker | manual | (typecheck) | n/a |
| audit-freshness (NEW I2) | hourly | (gate output) | CI alert when sources stale |
| uptime-monitor | every 5 min | PostHog uptime ping | n/a |
| cron-freshness-check | every 15 min | freshness alert events | `/admin/staleness` |
| ci | on push | (typecheck) | n/a |
| probe-reddit | manual | reddit-probe report | dev only |
| refresh-hotness-snapshot | daily | hotness rolling | (internal scoring) |
| refresh-skill-forks-snapshot | daily | skill-forks | `/skills` |
| refresh-pypi-downloads | every 6h | pypi-downloads | (internal scoring; no direct user surface yet) |
| refresh-reddit-baselines | weekly Mon | reddit-baseline | (internal — feeds cross-signal threshold) |
| scrape-claude-rss | daily | claude-rss | `/model-usage` Claude announcements |
| scrape-openai-rss | daily | openai-rss | `/model-usage` OpenAI announcements |
| scrape-awesome-skills | daily | awesome-skills index | `/skills` |
| aiso-self-scan | daily | aiso-self-scan report | dogfood |
| health-watch | every 30 min | source-health breaker state | internal — drives circuit breakers |

---

## 5. Surface-to-collector dependency density

When you ask "what collector matters most", count incoming edges:

| Collector | Surfaces depending |
|---|---|
| **scrape-trending** | 11+ surfaces (the whole site backbone — trending.json is THE root of derived-repos) |
| **scrape-bluesky / hn / devto / lobsters / reddit / twitter** | 6 surfaces each (own page + cross-signal breakouts + repo profile + signals page) |
| **collect-twitter** | 5 surfaces |
| **collect-funding** | 3 surfaces |
| **scrape-arxiv** | 3 surfaces |
| **refresh-skill-*** | 2 surfaces (`/skills` + `/skills/[slug]`) |
| **enrich-repo-profiles** | profile completeness (low blast radius if dies — old data persists) |
| **snapshot-stars (NEW)** | every delta number on every leaderboard |

**Top 3 single points of failure** by blast radius:
1. **scrape-trending** — kills every derived-repos consumer
2. **OSS Insight upstream** (api.ossinsight.io) — same blast radius from the API side
3. **Redis** (data-store) — kills everything (mitigated by 3-tier fallback to bundled JSON + memory)

---

## 6. Health check workflow for an operator

When something breaks:

1. **Identify the broken surface** — which page is empty/stale?
2. **Look it up in §3** — find the collector
3. **Check freshness** — `cat data/_meta/<key>.json | jq .ts` (or visit `/admin/staleness`)
4. **Check workflow run** — `gh run list --workflow=<name>.yml --limit=3 --json status,conclusion,createdAt`
5. **Check upstream** — try the external API directly (curl)
6. **Check pool** — if GitHub-related, `/admin/pool-aggregate`
7. **Check logs** — Sentry (`agnt-pf` org, EU `de.sentry.io`) for runtime errors

---

## 7. What this map deliberately doesn't cover

- **Internal pipeline modules** (scoring engine, classification, mention store) — those live in `src/lib/pipeline/*` and are derivative of collected data. See ENGINE.md §1 for the architecture summary.
- **Admin tools** — listed in §3h but not deeply mapped because they're operator UIs, not user surfaces.
- **API routes** — `/api/*` reads same data, mostly mirroring page surfaces. See `src/app/api/` for the list.
- **Worker fetchers (Railway side)** — covered in ENGINE.md §3 + the worker-audit doc (next session).

---

## 8. Refresh discipline

This file is the **canonical site-to-data wire map**. Update it in the same commit when:
- A new user-facing route lands
- A collector's data-store key changes
- A workflow's cron cadence shifts ≥2x
- A new fan-out function is introduced (joining multiple sources into one)

Sister doc: [ENGINE.md](ENGINE.md) (engine bottom-up) — keep both consistent.

**Last full sweep**: 2026-05-02 (initial), based on commit `7b91cf06` post-pool-finishing wave.
