# trendingrepo-worker

Cross-source trending leaderboard worker for trendingrepo.com. Self-contained Node package living under `apps/` of the STARSCREENER repo. NOT an npm workspace - install/run from inside this directory.

## What it does

- Pulls trending data from HuggingFace, GitHub, Bluesky, HN, ProductHunt, DevTo, Reddit, plus Firecrawl-backed crawls of PulseMCP / Smithery / mcp.so / claude.com/code/skills.
- Upserts normalized rows into Supabase Postgres (`trending_items`, `trending_metrics`, `trending_assets`) - cold tier.
- Publishes denormalized leaderboard JSON to Redis (Railway ioredis or Upstash REST) - hot tier the frontend reads. Same `ss:data:v1:*` namespace the existing STARSCREENER `data-store.ts` uses.
- pg_cron recomputes per-type z-score `trending_score()` nightly at 03:00 UTC.

## Local dev

```bash
# from THIS directory (apps/trendingrepo-worker)
npm install
cp .env.example .env.local        # fill in values

npx supabase init                 # first time only
npx supabase start                # boots local Postgres + extensions in Docker
npx supabase db reset             # applies migration + seed

npm run typecheck
npm run test                       # vitest, includes SQL parity test (skips if supabase local not up)
npm run dev                        # tsx watch on src/index.ts
```

## Run a fetcher

```bash
npm run fetcher -- huggingface
npm run fetcher -- github -- --dry-run
```

## Healthcheck

```bash
npx tsx src/index.ts --healthcheck     # one-shot, exits 0/1
curl http://localhost:8080/healthz     # while running in --cron mode
```

## Sentry

- Org: `agnt-pf` (EU region, `de.sentry.io`)
- Project: `trendingrepo-worker` (id 4511285393686608, created 2026-04-26)
- DSN goes in `.env.local` only (gitignored).

## Why self-contained (not a workspace)

The earlier attempt added `"workspaces": ["apps/*"]` to the monorepo root `package.json`. That entangled trendingrepo's lockfile with STARSCREENER's 25 CI workflows and Next.js Tailwind/PostCSS toolchain. Reverted.

This package has its own `package-lock.json`, its own `node_modules`, its own `.gitignore`. The trade-off: you `cd apps/trendingrepo-worker` before running anything. The win: zero blast radius on the rest of the repo.

## Reference

- Plan: `~/.claude/plans/for-the-next-prompt-composed-spark.md`
- Hot-tier data-store contract (mirrored, not imported): `../../src/lib/data-store.ts` + `../../scripts/_data-store-write.mjs`. Same key namespace `ss:data:v1:<slug>` and `ss:meta:v1:<slug>` so the Next.js frontend reads what we write.

## All crons run UTC

`pg_cron` defaults to UTC. The worker's pino logger uses ISO-8601 with `Z`. Don't second-guess local time.
