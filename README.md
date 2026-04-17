# StarScreener

**The repo momentum terminal.** Dexscreener-style dense scanning UI for GitHub repos with live momentum scoring, breakout detection, category heat, and social signal aggregation.

![License](https://img.shields.io/badge/license-MIT-green)

## What it does

- Tracks 300+ curated GitHub repos across 10 categories
- Computes a 0-100 momentum score from star velocity, fork growth, contributor growth, commit/release freshness, social buzz, with anti-spam dampening and breakout/quiet-killer detection
- Surfaces trending movers, breakouts, quiet killers, fresh releases, rank climbers
- Ingests social signals from Hacker News (Algolia API), Reddit (public JSON), and GitHub issue mentions
- Watchlist + alerts with rule-based trigger evaluation

## Stack

Next.js 15 App Router . React 19 . TypeScript strict . Tailwind 4 . Recharts . Zustand (persist) . Framer Motion . Lucide . next-themes . JSONL file persistence . native fetch (no Octokit)

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in GITHUB_TOKEN + CRON_SECRET
npm run dev -- -p 3008
```

Open http://localhost:3008

### Seed the pipeline with real data (optional)

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3008/api/cron/seed
```

Without `GITHUB_TOKEN`, the pipeline uses mock data (80 realistic repos) so the UI still works.

## Directory structure

```
src/
├── app/              # Next.js App Router (pages + API routes)
├── components/       # React components
│   ├── terminal/     # Terminal table, FilterBar, FeaturedCards
│   ├── detail/       # Repo detail page sections
│   ├── layout/       # Sidebar, Header, MobileNav
│   └── shared/       # Primitive UI
├── lib/
│   ├── pipeline/     # Data layer
│   │   ├── adapters/       # GitHub + social adapters
│   │   ├── ingestion/      # ingest, snapshotter, scheduler
│   │   ├── scoring/        # momentum engine + components
│   │   ├── classification/ # rule-based classifier
│   │   ├── reasons/        # why-it's-moving generator
│   │   ├── alerts/         # rule eval + digest
│   │   ├── queries/        # query service
│   │   └── storage/        # in-memory + JSONL persistence
│   ├── hooks/        # useFilteredRepos, useSortedRepos
│   └── store.ts      # Zustand stores
```

## Commands

- `npm run dev` — start dev server (use `-- -p 3008` to pick a port)
- `npm run build` — production build
- `npm run start` — serve production build
- `npm test` — run pipeline unit tests
- `npm run typecheck` — TypeScript check
- `npm run seed` — seed pipeline via `/api/cron/seed` (requires `CRON_SECRET`)
- `npm run ingest:hot` / `ingest:warm` / `ingest:cold` — trigger tier ingestion
- `npm run recompute` — trigger pipeline score recomputation

## API

- `GET /api/repos` — list trending repos (window, filter, category, sort)
- `GET /api/repos/[owner]/[name]` — full repo detail + score + reasons + mentions
- `GET /api/search?q=...` — fuzzy search
- `GET /api/pipeline/status` — pipeline health
- `POST /api/pipeline/recompute` — trigger score recomputation
- `POST /api/pipeline/ingest` — ingest specific repos (body: `{ fullNames: [...] }`)
- `GET /api/pipeline/featured?limit=8` — featured trending cards
- `GET /api/pipeline/meta-counts` — meta filter counts
- `GET /api/pipeline/alerts?userId=local` — recent alert events
- `GET/POST/DELETE /api/pipeline/alerts/rules` — alert rule CRUD
- `POST /api/cron/ingest?tier=hot|warm|cold` — cron-protected tier ingestion
- `POST /api/cron/seed` — one-shot seed from curated list

See [docs/API.md](./docs/API.md) for full request/response schemas.

## Docs

- [INGESTION.md](./docs/INGESTION.md) — how real GitHub ingestion works
- [DEPLOY.md](./docs/DEPLOY.md) — Vercel deployment walkthrough
- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) — pipeline internals
- [DATABASE.md](./docs/DATABASE.md) — migration path from in-memory to Postgres
- [API.md](./docs/API.md) — per-endpoint API reference

## License

MIT — see [LICENSE](./LICENSE).
