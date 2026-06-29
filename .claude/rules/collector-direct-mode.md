---
name: collector-direct-mode
description: Collectors run in `direct` mode, not `api` — serverless route filesystems are ephemeral
paths:
  - src/collectors/**
  - scripts/collect-*
  - scripts/_apify-twitter-provider.ts
  - scripts/_twitter-collector.ts
  - scripts/scrape-*.mjs
  - bin/**
  - cli/**
  - .github/workflows/**
---

# Collectors — `direct` mode only

From `CLAUDE.md:48`:

> Collectors run in `direct` mode, NOT `api` mode. Serverless route filesystems are ephemeral — API-mode writes vanish. GitHub Actions writes locally to `.data/*.jsonl` and `git push` from the workflow. See `.github/workflows/collect-twitter.yml` (committed fix `edf99d2`).

`collect-twitter.yml` is **`workflow_dispatch`-only** today (verified in file head — `# Manual-only: HOSTUP worker/runtime owns production freshness`). The `mode` input defaults to `"direct"`.

## What `direct` mode means

- The collector script runs on a GitHub Actions runner (or locally), writes JSONL into `.data/`, and `git push`es the result back to `main`.
- The collector **does NOT** POST to `/api/...` to ingest. API-mode writes vanish because the lambda filesystem is ephemeral.

## The lint guard

`scripts/check-collector-keep-last-50.mjs` — run via `npm run lint:keep-last-50` (`package.json:53`). Enforces every collector reads existing → unions → dedupes → keeps top 50 (`CLAUDE.md:89`). Surfaces always show last-50 cached and degrade gracefully to slightly-stale rather than empty.

## Production freshness ownership

Per `CLAUDE.md:26`:

> Production source freshness is owned by the HOSTUP worker fleet, not GitHub duplicate scrapers.

The worker (`apps/trendingrepo-worker/src/registry.ts`) is the production data plane for worker-owned sources (44 active fetchers in `FETCHERS[]` per `docs/ENGINE.md:15`). GHA collectors are kept for backfills + sources not yet ported.

## When editing

- Don't switch a collector back to API mode (`CLAUDE.md:80`).
- Commit `.data/*.jsonl` from inside GHA — see `collect-twitter.yml` workflow for the canonical pattern.
- If you add a new collector under `scripts/`, also add a `:scrape:<source>` script to `package.json` and a corresponding `.github/workflows/scrape-<source>.yml` with `direct` mode.
- For worker-owned sources: extend `apps/trendingrepo-worker/src/registry.ts` and write to Redis key `ss:data:v1:<slug>` (`CLAUDE.md:77`) — do NOT add a duplicate GHA scraper.
