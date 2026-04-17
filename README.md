# StarScreener

**Live GitHub trend terminal — Dexscreener for open source.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![CI](https://github.com/0motionguy/starscreener/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/0motionguy/starscreener/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg?logo=typescript&logoColor=white)](./tsconfig.json)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg?logo=next.js)](https://nextjs.org)

## What is this?

StarScreener ingests real GitHub data for a curated seed of ~300 repos, scores momentum and breakout velocity against rolling baselines, and surfaces the movers through a Dexscreener-style terminal UI, a REST API, a CLI, an SSE event stream, and an MCP server. All numbers come from live sources — there is a strict **no-mock rule** in the ingestion pipeline; if a value can't be verified against GitHub, HN, Reddit, or Nitter, it isn't shown.

<!-- Live demo: TODO — no public deploy yet. -->

## Features

- **Live GitHub ingestion** with per-endpoint retry + rate-limit backoff (native `fetch`, no Octokit).
- **300-repo curated seed** across 10 categories, plus **nightly stargazer-backfill for the top 20** to produce real historical sparklines.
- **10 categories** (AI/LLM, Dev Tools, Infra, Web3, Frontend, Backend, Data, Security, DevOps, Other) with per-category heat and leaderboards.
- **Momentum scoring** (0–100) blending star velocity, fork growth, contributor churn, commit/release freshness, and social mentions — with anti-spam dampening.
- **Trend + breakout detection** against rolling baselines; also flags quiet killers, rank climbers, and fresh releases.
- **SSE event stream** at `/api/events/stream` for live UI updates and external subscribers.
- **MCP server** (`mcp/`) exposing the REST surface as read-only tools for Claude Desktop and other agents.
- **CLI** (`bin/ss.mjs`) for terminal-native trend browsing — zero deps, Node 18+.
- **Dynamic OG share cards** per repo and per page via Next.js `opengraph-image` routes.
- **No-mock rule** — every metric is derived from a live source or persisted GitHub snapshot; placeholder data is forbidden.

## Quickstart

```bash
git clone https://github.com/0motionguy/starscreener.git
cd starscreener
npm install
cp .env.example .env.local    # then fill in GITHUB_TOKEN + CRON_SECRET
npm run dev                   # localhost:3000
npm run seed                  # in a second terminal — ~6 min, ingests 300 repos
npm run backfill:top          # populate sparklines for top 20 breakouts
```

`GITHUB_TOKEN` needs `public_repo` scope. `CRON_SECRET` is any random string — the cron routes require it as a bearer token.

## Architecture

Next.js 15 App Router, React 19, TypeScript strict. Persistence is **JSONL files under `.data/`** — no external DB for v0. Ingestion runs on **Vercel crons** split into **hot / warm / cold tiers**; a tier-based scheduler decides which repos get refreshed when based on momentum, rank, and staleness. Client state uses **Zustand** (with `persist` for the watchlist). The REST surface lives under `src/app/api/`, and the SSE bus is a single long-lived route.

Full write-up: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). API reference: [docs/API.md](docs/API.md). Ingestion internals: [docs/INGESTION.md](docs/INGESTION.md). Storage layout: [docs/DATABASE.md](docs/DATABASE.md).

## Surfaces

### Web UI

| Route | What it is |
| --- | --- |
| `/` | Terminal home — trending, breakouts, category heat, live ticker. |
| `/search` | Full-text + filter search across the ingested repo set. |
| `/categories` | Category index; drill into any of the 10 for per-category leaderboards. |
| `/compare` | Side-by-side compare of 2–4 repos with winner picks per dimension. |
| `/repo/[owner]/[name]` | Deep detail view: sparkline, score breakdown, reasons, social, related. |
| `/watchlist` | Local (Zustand-persisted) watchlist with rule-based alerts. |

### CLI

```bash
npm link          # registers the `ss` binary globally
ss trending       # print the top trending repos right now
```

Example (real output, truncated):

```
#  REPO                           STARS     Δ24h   MOMENTUM  TREND     CATEGORY
1  chroma-core/chroma             27,472    +312   84        rising    ai-llm
2  ollama/ollama                  96,104    +488   81        rising    ai-llm
3  vercel/next.js                128,902    +214   76        steady    frontend
4  anthropics/claude-code         11,208    +642   92        breakout  dev-tools
...
```

Other commands: `ss breakouts`, `ss new`, `ss repo <owner>/<name>`, `ss compare <a> <b>`, `ss categories`. `ss --help` for the full list.

### MCP

```bash
npm run mcp:build
```

Then add to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "starscreener": {
      "command": "node",
      "args": ["/absolute/path/to/starscreener/mcp/dist/server.js"],
      "env": {
        "STARSCREENER_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

All tools are read-only. Full tool list in [mcp/README.md](mcp/README.md).

## Known limits

- **Sparkline backfill ceiling.** GitHub caps stargazer listings at ~400 pages (≈40,000 stargazers). Repos above that cap can't have history reconstructed retroactively — they show **"Collecting history"** until the daily snapshot cron builds a forward history over days.
- **SSE requires a long-lived process.** Vercel serverless functions won't hold the connection open. For the full live-stream experience, deploy to **Railway**, **Fly.io**, or self-host on a VPS. Vercel still works fine for every non-SSE surface.
- **Twitter/X mentions via Nitter.** Social counts from X depend on public Nitter mirrors being reachable. When every mirror we probe is down, the Twitter section is **hidden** rather than faked — consistent with the no-mock rule.

## Development

```bash
npm run typecheck    # tsc --noEmit, strict
npm test             # tsx --test for the pipeline test suite
npm run lint         # eslint (next/core-web-vitals)
```

## Deploy

- **Vercel** works out of the box for the web UI, REST API, and crons. SSE will not hold open on serverless.
- **Railway / Fly.io / VPS** for the full platform including the SSE event stream.

Step-by-step: [docs/DEPLOY.md](docs/DEPLOY.md).

## License

[MIT](./LICENSE).

## Credits

StarScreener built by [@Kermit457](https://github.com/Kermit457) with [Claude Code](https://claude.com/claude-code).
