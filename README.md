<div align="center">

# TrendingRepo

**The trend map for open source.**

[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e.svg?style=for-the-badge)](./LICENSE)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-000000.svg?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg?style=for-the-badge&logo=typescript&logoColor=white)](./tsconfig.json)
[![Portal v0.1](https://img.shields.io/badge/Portal-v0.1-f56e0f.svg?style=for-the-badge)](https://visitportal.dev)
[![MCP](https://img.shields.io/badge/MCP-ready-a855f7.svg?style=for-the-badge)](https://modelcontextprotocol.io)

[![Tech-debt audit](https://img.shields.io/badge/audit-71%2F87%20closed-22c55e.svg?style=for-the-badge)](./docs/AUDIT_COMPLETE.md)
[![V2 conformance](https://img.shields.io/badge/V2%20conformance-100%25-22c55e.svg?style=for-the-badge)](./scripts/check-no-legacy-tokens.mjs)
[![Critical findings](https://img.shields.io/badge/critical%20open-0-22c55e.svg?style=for-the-badge)](./docs/AUDIT_COMPLETE.md)
[![CI](https://github.com/0motionguy/starscreener/actions/workflows/ci.yml/badge.svg)](https://github.com/0motionguy/starscreener/actions/workflows/ci.yml)

[**Live**](https://trendingrepo.com)  ·  [**Portal manifest**](https://trendingrepo.com/portal)  ·  [**API docs**](https://trendingrepo.com/portal/docs)  ·  [**CLI**](https://trendingrepo.com/cli)  ·  [**@0motionguy**](https://x.com/0motionguy)

<br />

[![TrendingRepo — live homepage](https://trendingrepo.com/opengraph-image)](https://trendingrepo.com)

</div>

### Screenshots

Every image below is served live from the deployed app — click through to the real surface.

| Surface | Live preview |
|---|---|
| Homepage (terminal + bubble map) | [trendingrepo.com](https://trendingrepo.com)  ·  [OG card](https://trendingrepo.com/opengraph-image) |
| Compare deep-dive | [/compare](https://trendingrepo.com/compare)  ·  [OG card](https://trendingrepo.com/compare/opengraph-image) |
| Repo detail | [NawfalMotii79/PLFM_RADAR](https://trendingrepo.com/repo/NawfalMotii79/PLFM_RADAR)  ·  [OG card](https://trendingrepo.com/repo/NawfalMotii79/PLFM_RADAR/opengraph-image) |
| Category page | [/categories/ai-agents](https://trendingrepo.com/categories/ai-agents) |
| Portal docs | [/portal/docs](https://trendingrepo.com/portal/docs) |
| CLI page | [/cli](https://trendingrepo.com/cli) |

---

TrendingRepo ingests GitHub, Reddit, Hacker News, ProductHunt, Bluesky, and dev.to signals every 20 min, scores momentum + breakout velocity across the stack, and surfaces the movers through four parallel surfaces: a **web terminal** with a bubble map, a **zero-dependency CLI**, an **MCP server** for Claude / any agent, and a **Portal v0.1** endpoint so any LLM can query trending repos with a single manifest fetch.

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

## API

Full OpenAPI 3.1 spec: [`docs/openapi.yaml`](./docs/openapi.yaml) (source of truth) or [`docs/openapi.json`](./docs/openapi.json) (served live at `/api/openapi.json`).

Explore interactively at [**/docs**](https://trendingrepo.com/docs) — rendered with Redoc from a CDN-loaded bundle (zero added app-bundle weight). Raw spec: [`docs/openapi.yaml`](./docs/openapi.yaml) or `/api/openapi.json`.

```bash
# Local
open http://localhost:3023/docs

# Or bring your own tool against the deployed spec
npx @redocly/cli preview-docs docs/openapi.yaml
open "https://petstore.swagger.io/?url=https://trendingrepo.com/api/openapi.json"
```

Primary entry point for programmatic use: **`GET /api/repos/{owner}/{name}?v=2`** — returns the full profile (score, reasons, mentions, freshness, twitter, npm, ProductHunt, revenue, funding, related, prediction, ideas) in one round-trip.

Auth surfaces summarised: public reads have no auth; write endpoints use `Authorization: Bearer <CRON_SECRET | ADMIN_TOKEN | USER_TOKEN>`, or the HMAC-signed `ss_user` cookie issued by `POST /api/auth/session`. See the spec for the per-endpoint matrix.

When editing the spec, regenerate the JSON sibling so `/api/openapi.json` stays in sync:

```bash
npx @redocly/cli bundle --ext json docs/openapi.yaml > docs/openapi.json
```

## Feeds & syndication

StarScreener exposes RSS 2.0 feeds for the two highest-leverage streams so
aggregators, newsletters, and LLM agents can subscribe without polling the
HTML pages. Every feed is hand-rolled (no deps), cached for 30 min at the
edge, and valid against W3C Feed Validator.

| Feed | Contents | Cadence |
|---|---|---|
| [`/feeds/breakouts.xml`](https://trendingrepo.com/feeds/breakouts.xml) | Top 30 repos firing on 2+ signals (GitHub + Reddit + HN), sorted by cross-signal score. Matches the `/breakouts` page's default "multi" filter. | `s-maxage=1800, stale-while-revalidate=3600` |
| [`/feeds/funding.xml`](https://trendingrepo.com/feeds/funding.xml) | 30 most recent AI / startup funding signals from TechCrunch, VentureBeat, Sifted, YC, NewsAPI. Each `<item>` links to the source article. | `s-maxage=1800, stale-while-revalidate=3600` |

Each item includes an RFC-822 `pubDate`, an `isPermaLink` `guid`, category
tags, author attribution, and a CDATA-wrapped HTML description so inline
markup survives round-tripping through RSS readers. Discovery tags are
emitted via `<atom:link rel="self">` in both feeds.

The sitemap ([`/sitemap.xml`](https://trendingrepo.com/sitemap.xml)) includes
every static page, every category, every collection, and up to 5,000 tracked
repos ordered by momentum — each `/repo/{owner}/{name}` entry carries its
own `lastModified` timestamp derived from `lastCommitAt`, with `priority`
scaled 0.3–0.9 by `momentumScore` so hot repos get crawled more aggressively.

```bash
# Subscribe via any RSS client, or preview in a terminal:
curl -sS https://trendingrepo.com/feeds/breakouts.xml | head -c 500
curl -sS https://trendingrepo.com/feeds/funding.xml   | head -c 500
curl -sS https://trendingrepo.com/sitemap.xml         | head -c 500
```

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

## Design system

V3 is the production skin: a Node/01 x Linear fusion. Dark canvas, sharp 2px
corners, hairline frames, mono uppercase labels, accent reserved for the
focused object. New work targets `--v3-*` tokens and `.v3-*` utility classes;
older `--v2-*` names are aliased to V3 in `src/app/globals.css` so partially
migrated components inherit the V3 palette automatically.

The full token vocabulary (surfaces, hairlines, ink, accents, motion) is
documented in [`docs/DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md). Two CI
guards prevent regression: `npm run lint:tokens` rejects new `--v2-*` /
legacy hex references, and `npm run lint:v3-budget` snapshots `--v2-*`
alias counts in `scripts/_v3-token-baseline.json` and fails when any
pattern grows.

## Testing

Three runners cover different layers; the [CI workflow](./.github/workflows/ci.yml)
runs all three on every PR and push to `main`.

```bash
npm run test:hooks       # Vitest — 93 tests for hooks, components, lib
npm test                 # node:test + tsx --test — collectors, pipeline, tools, portal
npm run test:e2e         # Playwright — 12 E2E smokes against a production build
```

In CI the gate also runs `npm run typecheck`, the chained `npm run lint:guards`
(tokens, err-message, zod-routes, route-runtime, error-envelope), the
standalone `lint:v3-budget` guard, and a full `next build` before Playwright
boots `next start` on port 3023.

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
npm run scrape:ph         # requires PRODUCTHUNT_TOKEN
npm run fetch:metadata
npm run compute-deltas

# Portal conformance against the live endpoint
npm run portal:conformance
```

## Deploy

Vercel. Root-level `next.config.ts` is prod-safe (no turbopack, no experimental flags). The homepage, categories, and collections pages build as static (`○`) with `revalidate = 1800` — so every edge request hits cache and the pipeline only recomputes when data changes on main.

Required env: `GITHUB_TOKEN` (for scraping + compare API), `CRON_SECRET` (guards `/api/pipeline/*` admin routes). ProductHunt refreshes also require a GitHub Actions secret named `PRODUCTHUNT_TOKEN` for `.github/workflows/scrape-producthunt.yml`, or the same variable in `.env.local` for `npm run scrape:ph`. See [`.env.example`](./.env.example).

## Scheduled jobs

The pipeline's recurring work (ingest, persist, cleanup, rebuild, predictions, AISO drain, freshness probe) is wired to two schedulers in parallel for redundancy — pick one as primary, or keep both if you accept double-fires (the per-file locks and in-process cooldowns tolerate overlap).

| Schedule (UTC)   | Endpoint                         | Purpose                                     |
| ---------------- | -------------------------------- | ------------------------------------------- |
| `15 */2 * * *`   | `/api/pipeline/ingest`           | GitHub + social adapters batch ingest       |
| `30 */6 * * *`   | `/api/pipeline/persist`          | Flush in-memory stores to JSONL             |
| `0 4 * * *`      | `/api/pipeline/cleanup`          | Archive / delete stale repo rows            |
| `0 5 * * 0`      | `/api/pipeline/rebuild`          | Weekly full rebuild (Sundays)               |
| `0 6 * * *`      | `/api/cron/predictions`          | Daily top-N momentum predictions            |
| `0,30 * * * *`   | `/api/cron/aiso-drain`           | Drain AISO rescan queue (every 30 min)      |
| `5,35 * * * *`   | `/api/cron/webhooks/scan`        | Enqueue breakout + funding webhook deliveries |
| `10,40 * * * *`  | `/api/cron/webhooks/flush`       | Drain Slack / Discord webhook queue         |
| `*/15 * * * *`   | `/api/health`                    | Unauthed freshness / status probe           |

### Primary: GitHub Actions

`.github/workflows/cron-*.yml` — richer logs, manual fire via `workflow_dispatch`, and per-run concurrency groups. Requires the repo's Actions to be enabled and these secrets/vars:

- `secrets.CRON_SECRET` — must match the server's `CRON_SECRET` env
- `vars.STARSCREENER_URL` — optional; defaults to the hard-coded prod URL in each workflow

### Fallback: Vercel Cron

`vercel.json` -> top-level `crons` field — native to Vercel Deployments, auto-adds `Authorization: Bearer <CRON_SECRET>` when you set `CRON_SECRET` as a project env var, no extra wiring required. Vercel Cron fires **GET** (not POST), so every cron endpoint either already exports GET or has a GET alias that delegates to POST. `/api/pipeline/ingest` keeps its existing GET usage-docs response and only switches to ingest behavior when called with `?cron=1` (as registered in `vercel.json`).

### Picking one

If you deploy on Vercel AND have GitHub Actions enabled, both will fire on roughly the same cadence. The in-process ingest cooldown, per-file locks (AISO queue, predictions JSONL), and idempotent persistence make duplicate runs safe — but you will pay for two runs per cycle.

- **Keep GH Actions primary** (recommended): delete or comment out the `crons` block in `vercel.json`.
- **Keep Vercel Cron primary**: disable the `.github/workflows/cron-*.yml` workflows (Actions -> select -> "Disable workflow"). Do not delete them — the files remain a usable fallback.
- **Keep both** (belt-and-suspenders): leave both live. Expect roughly 2x cron runs with no correctness impact.

If you deploy outside Vercel (e.g. self-hosted), only the GitHub Actions path fires.

### Operator checklist before a Vercel deploy

1. Set `CRON_SECRET` in the Vercel project's env (Production + Preview), distinct from `ADMIN_TOKEN`.
2. Redeploy so the new env reaches the cron handlers.
3. First cron tick after deploy: verify in the Vercel -> Cron dashboard that all 7 jobs registered and their next-run times are correct.
4. Manually trigger any cron from the Vercel dashboard to smoke the auth path end-to-end.

## Webhooks

Deliver breakout, funding, and (phase-2) revenue events to Slack or Discord as structured messages. No UX — pure outbound infrastructure.

**How it works:**

1. `data/webhook-targets.json` holds a list of operator-configured targets. The scan cron (`/api/cron/webhooks/scan`, every 30 min at :05 / :35) reads the latest derived repos + funding feed and enqueues a row per matching target into `.data/webhook-queue.jsonl`. Enqueue is idempotent — the same (event, subject, target) tuple never duplicates.
2. The flush cron (`/api/cron/webhooks/flush`, every 30 min at :10 / :40) drains the queue. 5s timeout per POST, 3s gap between POSTs to avoid rate limits. Non-2xx responses bump `attempts`; rows that hit 5 attempts move to `.data/webhook-dead-letter.jsonl` so the queue can drain forward.

**Add a Slack target:**

1. Create an Incoming Webhook at `https://api.slack.com/apps` -> your app -> "Incoming Webhooks". Copy the `https://hooks.slack.com/services/…` URL.
2. Append to `data/webhook-targets.json`:
   ```json
   [
     {
       "id": "devrel-slack",
       "provider": "slack",
       "url": "https://hooks.slack.com/services/T000/B000/XXXX",
       "events": ["breakout", "funding"],
       "filters": { "minMomentum": 80 },
       "enabled": true
     }
   ]
   ```
3. Commit, or just place locally. The loader is mtime-cached — the next scan/flush tick picks it up automatically.

**Add a Discord target:**

1. In Discord: Server Settings -> Integrations -> Webhooks -> New Webhook. Copy the `https://discord.com/api/webhooks/…` URL.
2. Append to `data/webhook-targets.json`:
   ```json
   {
     "id": "community-discord",
     "provider": "discord",
     "url": "https://discord.com/api/webhooks/123/abc",
     "events": ["funding"],
     "filters": { "minAmountUsd": 10000000 },
     "enabled": true
   }
   ```

**Filters:**

- `minMomentum` — breakouts only fire when `momentumScore >= N`.
- `minAmountUsd` — funding events only fire when the extracted amount meets the floor.
- `languages` — breakouts only fire for repos whose primary language matches (case-insensitive).

**Operator notes:**

- The URL is treated as a secret: it's never logged, never in error responses, never echoed by any API. Only the target `id` appears in logs.
- Only `https://*.slack.com` and Discord-family hostnames are accepted — a misconfigured URL is silently dropped at load time, so the queue cannot be redirected at an internal host.
- `WEBHOOK_TARGETS_PATH` can override the default path if you want to keep the config file outside the repo.
- Smoke test (no targets configured yet returns a clean `ok: true, delivered: 0`):
  ```bash
  curl -sS -X POST "http://localhost:3008/api/cron/webhooks/flush" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json" -d '{}'
  ```

## Credits

Built by [@0motionguy](https://x.com/0motionguy). Curated collections imported from [pingcap/ossinsight](https://github.com/pingcap/ossinsight) under Apache 2.0 (see `data/collections/NOTICE.md`). Portal spec from [visitportal.dev](https://visitportal.dev). MCP from [modelcontextprotocol.io](https://modelcontextprotocol.io).

## License

MIT — see [LICENSE](./LICENSE).
