# PRODUCT — What STARSCREENER / TrendingRepo is

## One-line definition (verbatim from `CLAUDE.md:20`)

> Real-time trend-discovery scanner. Aggregates GitHub stars, Twitter buzz, Reddit/HN/Bluesky/ProductHunt/DevTo signals, computes scoring + classification, surfaces breakout repos before they go mainstream.

Repo path: `C:\dev\trendingrepo`. Production host: `https://trendingrepo.com`. npm package
name: `trendingrepo-app` (`package.json:2`). Repo URL: `https://github.com/0motionguy/starscreener.git`
(`package.json:7-9`).

## What it actually does

Two halves:

1. **Collectors** — language-mixed scripts under `scripts/` and `bin/` that pull signal data
   from external sources, write append-only JSONL into `.data/`, and (during the Redis
   transition) dual-write the same payload into Redis via
   `scripts/_data-store-write.mjs` (`CLAUDE.md:47`).
2. **Next.js 15 app** — `src/app/` App-Router routes that read from the data-store
   (`src/lib/data-store.ts` — three-tier read: Redis → bundled file → in-memory last-known-good
   per `CLAUDE.md:26`) and render trend tables, bubble maps, breakout cards, and the
   per-repo deep-dives. Public site `trendingrepo.com`; the home `/` is ISR-cached at 30
   minutes (`revalidate=1800`, `CLAUDE.md:51`).

## Surfaces (every surface = file path)

| Surface | Purpose | Entry point |
|---|---|---|
| **Home `/`** | Dashboard / front page. ISR 30min. Reads `refreshTrendingFromStore()` then sync getters. | `src/app/page.tsx`, `src/lib/trending.ts` |
| **`/twitter`** | Twitter signal layer surface. | `src/app/twitter/*` (per `CLAUDE.md:33`) |
| **`/ideas`** | Repo-idea surfacing. | `src/app/ideas/*` |
| **`/funding`** | Funding-news radar (TechCrunch / VentureBeat / Sifted + SEC Form D + Crunchbase). | `src/app/funding/*` |
| **`/admin`** | Cookie-session admin surface (per `CLAUDE.md:29`, commit `e2a0908`). | `src/app/admin/*` |
| **`/reddit/trending`**, **`/hackernews/trending`**, **`/bluesky`**, **`/producthunt`**, **`/devto`**, **`/lobsters`** | Per-source signal pages. Bundled JSON cold-start fallback wired via `outputFileTracingIncludes` in `next.config.ts:73-83`. | per-source dirs under `src/app/` |
| **`/huggingface/{models,datasets,spaces}`** | HF model/dataset/space telemetry. | `src/app/huggingface/*` |
| **MCP server** | Code-review-graph integration for agents. | `mcp/` directory; build via `npm run mcp:build`. |
| **CLI** | `ss` command (`package.json:30-32`, `bin/ss.mjs`). Also at `cli/ss.mjs`. | `bin/ss.mjs` |
| **Worker** | HOSTUP Docker tenant data plane — 44 active fetchers in `FETCHERS[]` (per `docs/ENGINE.md:15`). | `apps/trendingrepo-worker/src/` |

## Collector inventory (entry-point paths, verified)

Twitter — `scripts/collect-twitter-signals.ts` (`package.json:103`, `npm run collect:twitter`).
Apify provider `scripts/_apify-twitter-provider.ts`. The actor is `apidojo~tweet-scraper`
(verified in `scripts/_apify-twitter-provider.ts:25` — `DEFAULT_ACTOR = "apidojo~tweet-scraper"`).

Other scrapers (all `npm run scrape:*`, `package.json:88-102`):

- Reddit — `scripts/scrape-reddit.mjs`
- Hacker News — `scripts/scrape-hackernews.mjs`
- Bluesky — `scripts/scrape-bluesky.mjs`
- ProductHunt — `scripts/scrape-producthunt.mjs`
- dev.to — `scripts/scrape-devto.mjs`
- Lobsters — `scripts/scrape-lobsters.mjs`
- arXiv — `scripts/scrape-arxiv.mjs`
- npm — `scripts/scrape-npm.mjs`
- HuggingFace — `scripts/scrape-huggingface.mjs` (+ `-datasets`, `-spaces` siblings)
- Funding news — `scripts/scrape-funding-news.mjs`
- SEC Form D — `scripts/scrape-sec-form-d.mjs`
- Claude/OpenAI RSS — `scripts/scrape-claude-rss.mjs`, `scripts/scrape-openai-rss.mjs`

Fan-out: `scripts/collect-all.mjs` (`npm run collect:all`).

## Reader pattern (NOT to be broken)

Server components and route handlers MUST call the per-source `refreshXxxFromStore()`
hook (async, once at the top of the file), then read sync getters thereafter. Each
refresh hook has internal **30s rate-limit + in-flight dedupe**, so calling it on every
render is cheap. Pattern reference: `src/lib/trending.ts::refreshTrendingFromStore` (per
`CLAUDE.md:46`).

## Wider context

- Sister product to AISO (also HOSTUP-not-Vercel per global `~/.claude/CLAUDE.md`); no
  direct contract surface between the two repos today (verified absent from
  `D:\dev\aiso-ecosystem\contracts\`).
- 2x2 swarm topology — `C:\dev\trendingrepo-wt\{tl,tr,bl,br}` worktrees on branches
  `bot/swarm-{tl,tr}-claude` and `bot/swarm-{bl,br}-codex` (ports 3023-3026). Operating
  contract: `docs/SWARM-2x2.md` (`CLAUDE.md:97-99`).
- Rescue handover (start here if picking up after consolidation):
  `docs/RESCUE-2026-05-08-HANDOVER.md` (`CLAUDE.md:67`).
- 97 `page.tsx` route files under `src/app` (`docs/SITE-WIREMAP.md:35`).

## Cross-references

- Component / data / collector fan-out: `docs/SITE-WIREMAP.md` (top-down menu walk).
- Cron + workflows + key inventory: `docs/ENGINE.md` (63 workflows verified 2026-05-05).
- Architecture: `docs/ARCHITECTURE.md`.
- Operator state: `docs/OPERATOR.md` (refreshed at end of every "go" wave).
