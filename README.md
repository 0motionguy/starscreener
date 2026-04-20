<div align="center">

# StarScreener

**The live GitHub trend terminal. Dexscreener for open source.**

[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e.svg?style=for-the-badge)](./LICENSE)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-000000.svg?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg?style=for-the-badge&logo=typescript&logoColor=white)](./tsconfig.json)
[![Portal v0.1](https://img.shields.io/badge/Portal-v0.1-f56e0f.svg?style=for-the-badge)](https://visitportal.dev)
[![MCP](https://img.shields.io/badge/MCP-ready-a855f7.svg?style=for-the-badge)](https://modelcontextprotocol.io)

[**Live demo**](https://starscreener.vercel.app)  ·  [**Portal manifest**](https://starscreener.vercel.app/portal)  ·  [**API docs**](https://starscreener.vercel.app/portal/docs)  ·  [**CLI**](https://starscreener.vercel.app/cli)  ·  [**@0motionguy**](https://x.com/0motionguy)

<br />

[![StarScreener — live homepage](https://starscreener.vercel.app/opengraph-image)](https://starscreener.vercel.app)

</div>

### Screenshots

Every image below is served live from the deployed app — click through to the real surface.

| Surface | Live preview |
|---|---|
| Homepage (terminal + bubble map) | [starscreener.vercel.app](https://starscreener.vercel.app)  ·  [OG card](https://starscreener.vercel.app/opengraph-image) |
| Compare deep-dive | [/compare](https://starscreener.vercel.app/compare)  ·  [OG card](https://starscreener.vercel.app/compare/opengraph-image) |
| Repo detail | [NawfalMotii79/PLFM_RADAR](https://starscreener.vercel.app/repo/NawfalMotii79/PLFM_RADAR)  ·  [OG card](https://starscreener.vercel.app/repo/NawfalMotii79/PLFM_RADAR/opengraph-image) |
| Category page | [/categories/ai-agents](https://starscreener.vercel.app/categories/ai-agents) |
| Portal docs | [/portal/docs](https://starscreener.vercel.app/portal/docs) |
| CLI page | [/cli](https://starscreener.vercel.app/cli) |

---

StarScreener ingests GitHub trending data every 20 min, scores momentum + breakout velocity, and surfaces the movers through four parallel surfaces: a **Dexscreener-style web terminal**, a **zero-dependency CLI**, an **MCP server** for Claude / any agent, and a **Portal v0.1** endpoint so any LLM can query trending repos with a single manifest fetch.

One data pipeline. Four consumers. No mocks — every number is anchored in a live source or a committed snapshot, so the numbers you see are the numbers your agent queries.

## Highlights

- 🫧 **Bubble map** — Coin360-style physics visualisation of the top 220 movers per window (24 h / 7 d / 30 d). Auto-stops when settled, so idle CPU is zero.
- 📈 **Momentum score (0–100)** — composite of 24 h / 7 d / 30 d star velocity + fork growth + contributor churn + commit / release freshness + anti-spam dampening.
- 🔥 **Breakout + hot + quiet-killer classifier** — tier-aware rules run against rolling baselines, not static cutoffs.
- 🎯 **15 categories** × 15 distinct hues — DevTools, AI Agents, MCP, Databases, Infra, Rust, Crypto, Web Frameworks, and more.
- ⚡ **ISR-cached homepage** — `revalidate = 1800`. Static edge hit, fresh data every 30 min via GHA scrape.
- 🧩 **Portal v0.1 + MCP server** — same three tools (`top_gainers`, `search_repos`, `maintainer_profile`) exposed over both protocols from a single registry. No drift between the CLI, the browser, and the agent.
- 📊 **Side-by-side compare** — pick up to 4 repos, see star-history, contributor grids, commit heatmaps, language breakdown, and a winner scoreboard.
- 🔖 **Watchlist + bookmarks** — local-first, synced via Zustand + `localStorage`. No auth required.
- 💻 **Zero-dep CLI** (`bin/ss.mjs`) — Node 18+, reads the same pipeline as the web.
- 🔎 **Live search preview** — debounced autocomplete dropdown with keyboard nav, rendered through a Portal so it escapes the sticky-header stacking context.

## Quick start

Three ways to use StarScreener, ordered by effort:

**1. Visit the site.** [starscreener.vercel.app](https://starscreener.vercel.app)

**2. Query from a terminal.**

```bash
# Via the spec-native Portal visitor
npx @visitportal/visit https://starscreener.vercel.app/portal top_gainers --limit=10

# Or via the native CLI (clones + runs from GitHub)
npx github:0motionguy/starscreener trending --window=24h --limit=5
```

**3. Plug into Claude / any MCP agent.**

```bash
# HTTP transport (Claude Code 2+)
claude mcp add starscreener \
  --transport http \
  --url https://starscreener.vercel.app/portal
```

Or hit the REST endpoint directly:

```bash
curl -X POST https://starscreener.vercel.app/portal/call \
  -H "Content-Type: application/json" \
  -d '{"tool":"search_repos","params":{"query":"agent","limit":5}}'
```

## Repository structure

```
starscreener/
├─ src/
│  ├─ app/                       Next.js App Router — pages, API routes, OG cards
│  │  ├─ page.tsx                  Homepage: bubble map + terminal (ISR 30 min)
│  │  ├─ search/ compare/          Search + side-by-side compare surfaces
│  │  ├─ repo/[owner]/[name]/      Repo detail page — growth chart, why-moving, mentions
│  │  ├─ collections/ categories/  Curated sets + category browsers
│  │  ├─ portal/                   GET /portal  +  POST /portal/call
│  │  ├─ portal/docs/              Integration guide (REST + MCP tabs)
│  │  ├─ cli/                      CLI landing page
│  │  └─ api/                      REST + pipeline admin + SSE stream
│  ├─ components/
│  │  ├─ terminal/                 Dense table, BubbleMap, FilterBar, FeaturedCards, column defs
│  │  ├─ compare/                  Side-by-side chart, heatmap, contributor grid, winner chips
│  │  ├─ detail/                   Repo detail: header, Recharts growth, why-moving, mentions
│  │  ├─ layout/                   AppShell, Sidebar, MobileDrawer, Footer
│  │  └─ shared/                   Primitives: Sparkline, SearchBar, badges
│  ├─ lib/
│  │  ├─ derived-repos.ts          Assembles the full Repo[] from data/*.json (cached once)
│  │  ├─ trending.ts               OSS Insight + git-history delta loader
│  │  ├─ bubble-pack.ts            Circle-pack algorithm for the bubble map
│  │  ├─ pipeline/
│  │  │  ├─ scoring/               Momentum score: components + weights + modifiers
│  │  │  ├─ classification/        Category + tag inference from topics, name, desc
│  │  │  ├─ ingestion/             GitHub API pulls, stargazer backfill
│  │  │  └─ storage/               Snapshot + repo + score stores (in-memory)
│  │  └─ types.ts                  Single source of truth for Repo, Category, etc.
│  ├─ portal/                     Portal v0.1 server — manifest, dispatcher, rate-limit, validate
│  └─ tools/                      Tool handlers (callable via /portal/call + MCP + CLI)
│     ├─ top-gainers.ts
│     ├─ search-repos.ts
│     └─ maintainer-profile.ts
├─ mcp/                           Published MCP server (starscreener-mcp) — stdio bridge
├─ bin/
│  └─ ss.mjs                      Zero-dependency CLI (Node 18+)
├─ data/                          Committed JSON — ships with every deploy
│  ├─ trending.json                 OSS Insight buckets (24h/7d/30d × 5 langs)
│  ├─ deltas.json                   Star deltas computed from git history
│  ├─ repo-metadata.json            GitHub REST snapshot per repo
│  ├─ recent-repos.json             Newly discovered repos
│  ├─ hot-collections.json
│  ├─ collection-rankings.json
│  └─ collections/                  Curated YAML sets (imported from OSS Insight, Apache 2.0)
├─ scripts/                       Data-refresh mjs scripts (run via GHA)
│  ├─ scrape-trending.mjs
│  ├─ compute-deltas.mjs
│  ├─ fetch-repo-metadata.mjs
│  ├─ discover-recent-repos.mjs
│  └─ portal-conformance.mjs
├─ docs/                          Architecture notes (ARCHITECTURE, API, DEPLOY, etc.)
├─ .github/workflows/
│  ├─ ci.yml                        Typecheck + lint + test + build on push/PR
│  ├─ scrape-trending.yml           Refresh data/*.json every 20 min (cron 7/27/47 * * * *)
│  └─ refresh-collection-rankings.yml
└─ public/                        Favicons, manifest, app icons
```

## Architecture

```
                            GitHub
                              │
             ┌────────────────┼────────────────┐
             │                │                │
    scrape-trending   fetch-repo-metadata   discover-recent
       (every 20m)         (daily)            (daily)
             │                │                │
             └────────────────┼────────────────┘
                              ▼
                       data/*.json  ──── committed to main
                              │
                              │  (read once per Lambda cold start)
                              ▼
              src/lib/derived-repos.ts
      ┌───────────┬───────────┼───────────┬───────────┐
      │           │           │           │           │
  classify    score   synth-sparkline  deltas    metadata
      └───────────┴─────────┬─┴───────────┴───────────┘
                            │
                    fully-scored Repo[]
                            │
       ┌─────────────┬──────┴──────┬──────────────┐
       │             │             │              │
   /  + /search  /api/repos    /portal/call    mcp/server.js
   (ISR 30m)    (REST + SSE)   (Portal v0.1)   (stdio → LLM)
```

## Data pipeline

1. **Every 20 min** — `scrape-trending.yml` refreshes `data/trending.json` (top movers across 24 h / 7 d / 30 d × 5 languages) and regenerates `data/deltas.json` from that file's git history so each repo gets windowed star deltas anchored in real commit timestamps.
2. **Daily** — `fetch-repo-metadata.mjs` pulls `data/repo-metadata.json` from the GitHub REST API (stars, forks, contributors, topics, avatar).
3. **Runtime** — `src/lib/derived-repos.ts` merges trending + metadata + recent-repos, runs `classifyBatch()` + `scoreBatch()`, and caches the result module-level (survives Lambda warm-starts).
4. **Deltas warm up over time** — for repos new to the tracking set, `delta_24h.basis === "cold-start"` until 24 h of history accumulates. The UI displays a dash instead of a fake 0 %, and sparklines are synthesized from the available anchors so rows aren't blank.

## Portal v0.1 integration

```bash
# Read the manifest
curl https://starscreener.vercel.app/portal | jq

# Call a tool
curl -X POST https://starscreener.vercel.app/portal/call \
  -H "Content-Type: application/json" \
  -d '{"tool":"top_gainers","params":{"limit":5}}'
```

Three tools, one registry (`src/tools/`):

| Tool | Purpose |
|---|---|
| `top_gainers` | Repos sorted by star delta across a window (24 h / 7 d / 30 d) |
| `search_repos` | Full-text search over name / description / topics, ranked by momentum |
| `maintainer_profile` | Aggregates owned repos for a GitHub handle across the tracked set |

Envelope on every response: `{ ok: true, result }` or `{ ok: false, error, code }` with stable codes (`NOT_FOUND`, `INVALID_PARAMS`, `RATE_LIMITED`, `INTERNAL`). Rate limit returns HTTP 429 with `Retry-After`.

## MCP server

A stdio MCP bridge lives in [`mcp/`](./mcp). Build + register:

```bash
npm run mcp:build
claude mcp add starscreener node ./mcp/dist/server.js
```

Or go HTTP-native (no bundle required):

```bash
claude mcp add starscreener --transport http --url https://starscreener.vercel.app/portal
```

## Development

```bash
# Install + run
npm install
npm run dev              # http://localhost:3023

# Quality
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm run test             # pipeline + tools + portal tests
npm run build            # production build

# Data refresh (local parity with GHA)
npm run scrape
npm run fetch:metadata
npm run compute-deltas

# Portal conformance against the live endpoint
npm run portal:conformance
```

## Deploy

Vercel. Root-level `next.config.ts` is prod-safe (no turbopack, no experimental flags). The homepage, categories, and collections pages build as static (`○`) with `revalidate = 1800` — so every edge request hits cache and the pipeline only recomputes when data changes on main.

Required env: `GITHUB_TOKEN` (for scraping + compare API), `CRON_SECRET` (guards `/api/pipeline/*` admin routes). See [`.env.example`](./.env.example).

## Credits

Built by [@0motionguy](https://x.com/0motionguy). Curated collections imported from [pingcap/ossinsight](https://github.com/pingcap/ossinsight) under Apache 2.0 (see `data/collections/NOTICE.md`). Portal spec from [visitportal.dev](https://visitportal.dev). MCP from [modelcontextprotocol.io](https://modelcontextprotocol.io).

## License

MIT — see [LICENSE](./LICENSE).
