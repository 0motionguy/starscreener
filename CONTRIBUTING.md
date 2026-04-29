# Contributing to TrendingRepo

Thanks for your interest. This guide gets you from clone to a merged PR.

## Prerequisites

- **Node 22.x** (pinned via `engines` in `package.json`)
- **npm** (lockfile is `package-lock.json`)
- A GitHub PAT for collectors that hit GitHub's API (set as `GITHUB_TOKEN` in `.env.local`)
- *Optional:* a Redis URL (`REDIS_URL` for Railway-native, or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for Upstash REST). Without one, the data-store gracefully falls back to bundled JSON + memory.

## Setup

```bash
git clone https://github.com/0motionguy/starscreener.git
cd starscreener
npm install
cp .env.example .env.local   # then fill in the required values
npm run dev                  # starts at http://localhost:3023
```

## Where things live

- `src/app/` — Next.js 15 App Router pages + API routes
- `src/lib/pipeline/` — ingestion, scoring, classification core
- `scripts/` — data collectors and one-shot maintenance scripts
- `apps/trendingrepo-worker/` — sister microservice (deployed separately on Railway)
- `mcp/` — MCP server source for agent integrations
- `docs/` — architecture, ingestion, deploy, source-discovery guides — **start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**

## Branching

- Branch off `main` for everything.
- Branch naming: `feat/<area>-<short-name>`, `fix/<area>-<short-name>`, `chore/<scope>`, `docs/<scope>`.
- Keep branches focused — one concern per PR makes review tractable.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/). Examples from the repo's history:

```
feat(scoring): Phase 3.1 — engagement composite scoring
fix(test): de-flake tampered-signature auth test
chore(workflows): add npm ci + stage data/_meta files
docs(deploy): document Vercel preview env vars
```

Common types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`, `perf`.

## Pre-PR checklist

Run locally before pushing:

```bash
npm run typecheck       # tsc --noEmit, must be clean
npm run lint            # ESLint
npm run lint:guards     # meta-lints (Zod on mutating routes, error envelopes, runtime drift)
npm test                # node:test + tsx + vitest, runs in serial
```

If you touched a workflow under `.github/workflows/`, confirm it parses (no YAML errors) and has appropriate `permissions:` and `concurrency:` blocks where relevant.

## Pull requests

- Open the PR against `main`.
- Fill out the [PR template](.github/PULL_REQUEST_TEMPLATE.md) — Summary + Test plan + checklist.
- Wait for CI green (Typecheck/lint/build/e2e + MCP server build + Vercel preview).
- Squash-merge is the convention; one PR = one commit on `main`.

## Data conventions

- **Reads must go through the data-store.** Server components / API routes call the per-source `refreshXxxFromStore()` once at the top, then sync getters return cached values.
- **Collectors dual-write file + Redis** via `scripts/_data-store-write.mjs`. File mirror is acceptable during transitions; Redis is the source of truth.
- **JSONL append-only.** Don't replace; append. The aggregator dedupes downstream.
- **Don't** `readFileSync(process.cwd(), "data", ...)` for new sources — go through the data-store.

## Anti-patterns to avoid

These have all bitten us before:

- Switching the Twitter collector back to API mode (silently fails on Vercel — use `direct` mode).
- Mocking Redis in tests that exercise scoring logic.
- Adding `./.next/**/*` to `outputFileTracingExcludes` in `next.config.ts` — strips the chunk graph and 500s every dynamic route.
- Cookie-based Twitter scrapers (dead provider post-2026 anti-bot).

## Questions?

Open a [discussion](https://github.com/0motionguy/starscreener/discussions) or an issue. For security-sensitive reports, see [SECURITY.md](SECURITY.md).
