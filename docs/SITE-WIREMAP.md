# SITE-WIREMAP.md — Frontend → Data → Collector → External API

**Purpose**: every user-facing route in the site, mapped to the data-store key it reads, the collector that populates that key, the cron schedule, and the external API at the source. Sister doc to [ENGINE.md](ENGINE.md) (which catalogues the engine bottom-up by service); this one walks **top-down from the menu**.

**Read-order**: when a route looks broken, look it up here, find its collector, then check `data/_meta/<key>.json` (last-write timestamp) and the matching workflow run on GitHub Actions.

**Cache column**: each route table in §3 carries a `Cache` column with one of `ISR` / `static` / `dynamic` / `private`. Values track the canonical cache policy declared in [`perf/routes.json`](../perf/routes.json) — that file is the source of truth for cache lifetimes, revalidate windows, and per-route performance budgets. When the policy diverges between this map and `perf/routes.json`, treat `perf/routes.json` as canonical and bring this doc back into sync. (Note: `perf/routes.json` lives in main checkout; in branches that predate PR1 it may not be present, which is fine — the column values here are still authoritative for documentation purposes.)

**Last refreshed**: 2026-05-09 (route-doc cleanup against current sidebar + sitemap truth)

---

## 1. Sidebar navigation — 9 rendered groups, 28 fixed clickable nav routes (+2 disabled placeholders)

[src/components/layout/SidebarContent.tsx](../src/components/layout/SidebarContent.tsx) defines the menu structure. Sections in render order:

1. **TREND TERMINAL** — Trending Repos / Trending Skills / Trending MCP / Trending AGNT / Breakouts / Consensus
2. **SIGNAL TERMINAL** — Market Signals / Hacker News / Lobsters / Dev.to / Bluesky / Reddit / X (Twitter) / Product Hunt
3. **LLM / PACK TERMINAL** — NPM Packages / HF Models (single sidebar row; Datasets/Spaces are in-page tabs)
4. **LAUNCH TERMINAL** — Funding Radar / Revenue / Agent Commerce / Hackathons (disabled) / Launch (disabled)
5. **RESEARCH TERMINAL** — arXiv Papers / Cited Repos
6. **EXPLORE** — Digest / Ideas / Collections
7. **TOOLS** — Watchlist / Compare / Tier List / Top 10
8. **RECENT** — recent repo links from local browser state (dynamic)
9. **WATCHING** — top 5 watchlist preview cards (user-state)

**Orphaned but URL-reachable** (kept on disk, not fixed sidebar rows): `/` (home dashboard), `/top` (Top 100), `/categories`, `/categories/[slug]`, `/pricing` (Plans), `/tools`, `/tools/star-history`, `/tools/treemap`, `/tools/revenue-estimate` (Revenue Tool), `/submit/revenue` (Drop Revenue), `/huggingface/datasets`, `/huggingface/spaces`, `/huggingface/models` (HF models alias). BACKLOG AGN-63 tracks the keep-vs-retire decision.

Routes NOT in the sidebar but addressable: `/u/[handle]`, `/repo/[owner]/[name]`, `/repo/[owner]/[name]/star-activity`, `/search`, `/alerts`, `/alerts/new`, `/submit`, `/submit/revenue`, `/cli`, `/portal/docs`, `/pricing`, `/digest/[date]`, `/agent-commerce/[slug]`, `/agent-commerce/facilitator/[name]`, `/agent-repos/[slug]`, `/skills/[slug]`, `/categories/[slug]`, `/collections/[slug]`, `/consensus/[owner]/[name]`, `/mcp/[slug]`, `/ideas/[id]`, `/tierlist/[shortId]`, `/s/[shortId]`, `/embed/top10`, `/design-lab/primitives`, `/admin/*`, `/model-usage`, `/you`, `/you/alerts`, `/you/refer`.

**Sitemap / noindex truth**: [src/app/sitemap-pages.xml/route.ts](../src/app/sitemap-pages.xml/route.ts) includes `/research` in `STATIC_HUBS`. `/model-usage` and `/watchlist` are private/noindex surfaces and must stay out of sitemap output; `/model-usage` is admin-gated with explicit `robots: { index: false, follow: false }`, and `/watchlist` is user-state/local-session content.

**TODO — `/you` auth/copy contradiction**: [src/app/robots.ts](../src/app/robots.ts) disallows `/you` and `/you/*`, but `/you` copy says "No account" and "local-only" browser state. Preserve current product behavior for now; reconcile whether `/you` is a private/auth-ish surface or a public local-profile surface before changing route behavior.

**Current route inventory**: 97 `page.tsx` route files under `src/app` (public, private, admin, utility, and dynamic routes).

---

## 2. The 5 data-fan-out functions

Most pages don't read raw collector output — they read derived/joined views. Five fan-out points absorb 95% of the engine's signal surface:

| Function | Source file | Reads from | Used by routes |
|---|---|---|---|
| `getDerivedRepos()` | [src/lib/derived-repos.ts](../src/lib/derived-repos.ts) | trending + reddit + HN + bluesky + devto + lobsters + npm + HF + arxiv + producthunt + funding + cross-signal + scoring | `/`, `/githubrepo`, `/breakouts`, `/top`, `/agent-repos`, `/categories/*`, `/u/[handle]`, `/search` |
| `buildCanonicalRepoProfile()` | [src/lib/api/repo-profile.ts](../src/lib/api/repo-profile.ts) | derived repo + twitter panel + npm packages + PH launch + revenue overlays + funding events + ideas + predictions + reasons + 6 mention synthesizers | `/repo/[owner]/[name]`, `/api/repos/[owner]/[name]?v=2` |
| `getSkillsSignalData()` | [src/lib/ecosystem-leaderboards.ts](../src/lib/ecosystem-leaderboards.ts) | skill-install-snapshot + skill-derivatives + awesome-skills + lobehub + skillsmp + smithery + 24h/7d/30d windows | `/skills`, `/skills/[slug]` |
| `getMcpSignalData()` | same | mcp-smithery + pulsemcp + mcp-dependents + mcp-usage-snapshot + mcp-liveness | `/mcp`, `/mcp/[slug]` |
| `buildConsensus(items)` | [src/lib/signals/consensus.ts](../src/lib/signals/consensus.ts) | hackernews + bluesky + devto rollups | `/signals`, `/consensus` (different surface, same engine) |

**Implication**: when a single collector dies (e.g. Reddit OAuth expires), 9+ routes degrade simultaneously because they all join via `getDerivedRepos()`. This is also why the per-source `_meta/*.json` freshness gate is so valuable — one source dying is a fleet-wide event.

---

## 3. Route-to-data wire map (sidebar order)

### 3a. TREND TERMINAL

| Route | Cache | Reads | Collector | Cron | External API |
|---|---|---|---|---|---|
| `/githubrepo` (Trending Repos) | ISR | `getDerivedRepos()` + `lastFetchedAt` (trending) | scrape-trending → `data/trending.json` | hourly `27 * * * *` | OSS Insight (`api.ossinsight.io/v1/trends/repos/`) |
| `/skills` (Trending Skills) | ISR | `getSkillsSignalData()` | refresh-skill-* (5 workflows) + skill-install-snapshot + skill-derivatives | every 6h → daily nightly (post-2026-05-02 cuts) | GitHub API (skills derivative repos), SkillsMP, Smithery, Lobehub, Claude RSS |
| `/mcp` (Trending MCP) | ISR | `getMcpSignalData()` | refresh-mcp-smithery-rank + ping-mcp-liveness + refresh-mcp-dependents + refresh-mcp-usage-snapshot | every 6h + daily | Smithery (`smithery.ai/api/...`), PulseMCP (`api.pulsemcp.com/v0/`), npm |
| `/agent-repos` (Trending AGNT) | ISR | `getDerivedRepos()` filtered by `agent` topic/tag | trending + scoring | (same as `/githubrepo`) | OSS Insight |
| `/breakouts` | ISR | `getDerivedRepos()` + `getChannelStatus()` (cross-signal) | trending + every mention source (6-channel) | various | OSS Insight + 6 mention APIs |
| `/consensus` | ISR | consensus payload via factory reader | snapshot-consensus + scoring shadow | daily `55 23 * * *` | derives from internal pipeline, no external |

### 3b. SIGNAL TERMINAL

| Route | Cache | Reads | Collector | Cron | External API |
|---|---|---|---|---|---|
| `/signals` (Market Signals) | ISR | `hnFetchedAt` + `blueskyFetchedAt` + `devtoFetchedAt` + `buildConsensus` + `buildVolume` | scrape-bluesky + scrape-trending (HN included) + scrape-devto | hourly + 6h | Bluesky, HN-Algolia, Dev.to API |
| `/hackernews/trending` | ISR | hackernews-repo-mentions + hackernews-trending payloads | scrape-trending (HN sidecar) | hourly | HN-Algolia (`hn.algolia.com/api/v1`) |
| `/lobsters` | ISR | lobsters-mentions + lobsters-trending payloads | scrape-lobsters | hourly | Lobsters (`lobste.rs/...`) |
| `/devto` | ISR | devto-mentions + devto-trending payloads | scrape-devto | every 6h | Dev.to (`dev.to/api/articles`) |
| `/bluesky/trending` | ISR | bluesky-mentions + bluesky-trending payloads | scrape-bluesky | hourly | Bluesky (`bsky.social/xrpc/`) |
| `/reddit/trending` | ISR | reddit-mentions payload | scrape-trending (reddit collector inside) | hourly | Reddit OAuth (`oauth.reddit.com`) |
| `/twitter` (X) | ISR | twitter-repo-signals (worker-fetched) | collect-twitter (Apify actor) | every 3h | Apify `apidojo~tweet-scraper` actor |
| `/producthunt` | ISR | `getDerivedRepoByFullName` + producthunt payload | scrape-producthunt | 4×/day at PT-cron | ProductHunt GraphQL (`api.producthunt.com/v2/api/graphql`) |

### 3c. LLM / PACK TERMINAL

| Route | Cache | Reads | Collector | Cron | External API |
|---|---|---|---|---|---|
| `/npm` (NPM Packages) | ISR | `refreshNpmFromStore()` → npm-trending + npm-downloads | scrape-npm + refresh-npm-downloads | daily + every 6h | npm registry + downloads (`api.npmjs.org/downloads/`) |
| `/huggingface/trending` (HF Models) | ISR | `refreshHfModelsFromStore()`; tab-only routes read `refreshHfDatasetsFromStore()` and `refreshHfSpacesFromStore()` | scrape-huggingface + scrape-huggingface-datasets + scrape-huggingface-spaces | every 3h → 6h (post-2026-05-02 cuts) | HF API (`huggingface.co/api/models`, `/datasets`, `/spaces`) |

HF route note: the sidebar intentionally has one Hugging Face row (`/huggingface/trending`). `/huggingface/datasets` and `/huggingface/spaces` are tab routes rendered by `HfNavTabs`; `/huggingface/models` re-exports the models page; `/huggingface` redirects to `/huggingface/models`.

### 3d. LAUNCH TERMINAL

| Route | Cache | Reads | Collector | Cron | External API |
|---|---|---|---|---|---|
| `/funding` (Funding Radar) | ISR | `refreshFundingNewsFromStore()` | collect-funding (Railway worker fetches) | every 6h | Crunchbase-like via Firecrawl + Coingecko + Dune + Libraries.io |
| `/revenue` | ISR | `refreshRevenueStartupsFromStore()` + `refreshRevenueOverlaysFromStore()` | sync-trustmrr (Trustmrr sync nightly) | daily `27 2 * * *` | Trustmrr API (`TRUSTMRR_API_KEY`) |
| `/submit/revenue` (Drop Revenue) | static | static form → POST to `/api/revenue/claim` | n/a (user submission) | n/a | n/a |
| (Hackathons, Launch nav-only — TBD pages) | static | placeholder routes | n/a | n/a | n/a |

### 3e. RESEARCH TERMINAL

| Route | Cache | Reads | Collector | Cron | External API |
|---|---|---|---|---|---|
| `/arxiv/trending` (arXiv Papers) | ISR | `refreshArxivFromStore()` | scrape-arxiv + enrich-arxiv | every 3h + every 12h (post-cuts) | arXiv OAI-PMH + abstract pages (`arxiv.org/abs/`) |
| `/research` (Cited Repos; sitemap-listed) | ISR | `refreshResearchSignalsFromStore()` | enrich-arxiv + cross-domain joins | every 12h | derived from arxiv + GitHub repo lookup |
| `/papers` | ISR | `getArxivRecentFile()` raw file | scrape-arxiv | every 3h | arXiv |

### 3f. EXPLORE

| Route | Cache | Reads | Collector | Cron | External API |
|---|---|---|---|---|---|
| `/digest` (Digest list) | ISR | `listAvailableDigestDates()` reads `data/digest/<YYYY-MM-DD>.json` | cron-digest-weekly | weekly Monday 8am | derived snapshot, no external |
| `/digest/[date]` | ISR | digest payload for the date | (same) | (same) | (same) |
| `/ideas` | ISR | repo-ideas store via Zustand + supabase if wired | user submissions + LLM enrichment via cron-llm | hourly `10 * * * *` | Kimi K2.6 (LLM) — non-default; falls back gracefully |
| `/categories` | ISR | `getDerivedCategoryStats()` over derived-repos | (same fan-out as `/`) | (same) | (same) |
| `/categories/[slug]` | ISR | category snapshot + window deltas | snapshot-category-metrics (W5-CATWINDOW) | hourly | (same) |
| `/collections` | ISR | `refreshCollectionRankingsFromStore()` | refresh-collection-rankings | every 6h | OSS Insight (`api.ossinsight.io/v1/collections/`) |
| `/collections/[slug]` | ISR | per-collection rank | (same) | (same) | (same) |
| `/pricing` (Plans) | static | static (Stripe wire-up planned) | n/a | n/a | Stripe (configured, not active) |
| `/tools/revenue-estimate` (Revenue Tool) | ISR | derived-repos + revenue overlays + heuristic | (same) | (same) | (same) |

### 3g. TOOLS

| Route | Cache | Reads | Collector | Cron | External API |
|---|---|---|---|---|---|
| `/watchlist` | private | Zustand `useWatchlistStore` (localStorage) + session-scoped alert APIs | n/a (client/session state) | n/a | n/a |
| `/compare` | ISR | client form → on-demand `githubFetch` to 7 endpoints | n/a (request-time) | n/a | GitHub API direct (pool-aware) |
| `/tierlist` | ISR | shared tierlist payloads | user submissions | n/a | n/a |
| `/tierlist/[shortId]` | ISR | persisted tierlist via shortId | (same) | n/a | n/a |
| `/top10` | ISR | `buildLiveTop10PageData()` | snapshot-top10 + snapshot-top10-sparklines | daily `55 23 * * *` + `50 23 * * *` | derived snapshots |
| `/top10/[date]` | ISR | date-pinned top10 snapshot | (same) | (same) | (same) |
| `/signals` (Signal Radar — same route as Market Signals above) | ISR | (see SIGNAL TERMINAL) | | | |

### 3h. UNLISTED but addressable

| Route | Cache | Reads | Collector | Cron | External API |
|---|---|---|---|---|---|
| `/` (Home dashboard) | ISR | `getDerivedRepos()` + skills/MCP summaries + derived movers | scrape-trending + skill/MCP refreshers | mixed | OSS Insight + derived ecosystem feeds |
| `/repo/[owner]/[name]` | ISR | `getDerivedRepoByFullName()` + `buildCanonicalRepoProfile()` (11 loaders + 6 synthesizers) | every collector (this is the fan-in point) | every cron | every API |
| `/repo/[owner]/[name]/star-activity` | ISR | star-activity time series | refresh-star-activity + append-star-activity | daily `17 3 * * *` | GitHub stargazers API (pool-aware) |
| `/u/[handle]` | ISR | `getProfile()` from data-store | enrich-repo-profiles + GitHub user fetch | hourly `41 * * * *` | GitHub user API + derived |
| `/search` | dynamic | client filter over `getDerivedRepos()` | (same) | (same) | (same) |
| `/alerts` | private | alert rules + persisted events | cron-aiso-drain | every 30 min | derived (no external) |
| `/alerts/new` | private | static form → API POST | n/a | n/a | n/a |
| `/model-usage` | private | model-usage-snapshot via tabbed UI | refresh-mcp-usage-snapshot + model-usage aggregation | daily `30 3 * * *` + monthly rotate | derived from internal LLM telemetry + Claude/OpenAI RSS |
| `/you` + `/you/*` | private | localStorage watchlist/compare/filter state + referral/alert affordances | n/a | n/a | n/a |
| `/submit` | static | static form (user submission) | promote-unknown-mentions ingest path | daily | derived from lake |
| `/cli` | static | static docs page | n/a | n/a | n/a |
| `/portal/docs` | static | static docs (API portal) | n/a | n/a | n/a |
| `/agent-commerce/*` | ISR | agent-commerce signal data | cron-agent-commerce | daily `31 4 * * *` | derived (LLM-augmented) |
| `/top` (Top 100) | ISR | `getDerivedRepos()` sorted by momentum score | same as core trending fan-out | hourly `27 * * * *` | OSS Insight + derived |
| `/embed/top10` | ISR | iframe-friendly Top10 | (same as `/top10`) | (same) | (same) |
| `/admin/*` | private | server-state snapshots | n/a (admin views, no collectors) | n/a | n/a |
| `/admin/pool` | private | per-process GitHub pool snapshot | n/a (live in-memory) | n/a | n/a |
| `/admin/pool-aggregate` | private | Redis-aggregate fleet view (POOL-REDIS) | every `recordRateLimit` writes to Redis | live | n/a |
| `/admin/staleness` | private | per-source freshness | reads `data/_meta/*.json` | live | n/a |
| `/admin/scoring-shadow` | private | shadow-scoring run results | run-shadow-scoring | daily `0 2 * * *` | n/a |

---

## 4. Reverse map — every collector and what surfaces depend on it

| Collector / Workflow | Cron | Output key | Surfaces breaking on failure |
|---|---|---|---|
| scrape-trending | hourly `27 * * * *` | `data/trending.json` | `/`, `/githubrepo`, `/breakouts`, `/top`, `/agent-repos`, `/categories/*`, `/u/[handle]`, `/search`, `/repo/*`, every derived-repos consumer |
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
| cron-llm | hourly `10 * * * *` | LLM-enriched fields on ideas | `/ideas` |
| cron-pipeline-ingest | every 2h `15 */2 * * *` | mention-store hydrate | repo profile recent mentions feed |
| cron-pipeline-persist | every 6h `30 */6 * * *` | mention-store persist | (same) |
| cron-pipeline-cleanup | daily `0 4 * * *` | mention-store pruning | (same) |
| cron-pipeline-rebuild | weekly `0 5 * * 0` | full rebuild | recovery only — never user-facing |
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
