---
last-verified: 2026-05-27
verified-by: claude
status: living
---

# trendingrepo-worker — Architecture

The sister worker service that produces every `ss:data:v1:<slug>` payload the trendingrepo app reads. Runs as `toolbox-trendingrepo-worker-1` on TOOLBOX (193.53.40.118), built from this package (`apps/trendingrepo-worker/`).

For the app-side architecture this worker feeds, see [../../../docs/REGISTRY-AND-LIFETIME-MENTIONS.md](../../../docs/REGISTRY-AND-LIFETIME-MENTIONS.md). For deploy mechanics, see [../../../docs/DEPLOY-TOOLBOX.md](../../../docs/DEPLOY-TOOLBOX.md).

## What this package is

A standalone Node 22 / TypeScript worker that owns the prod data plane:

- **37+ fetchers** under `src/fetchers/<name>/index.ts`, each implementing the `Fetcher` interface (`name`, `schedule` cron, async `run(ctx)`).
- **Croner scheduler** in `src/run.ts` — picks up `FETCHERS[]` from `src/registry.ts`, schedules each by its cron string, runs serially per fetcher (one at a time), records `run-summary` lines.
- **Redis adapter** in `src/lib/redis.ts` with two backends (ioredis for TCP `REDIS_URL`, @upstash/redis for REST). `gz1:` magic prefix for gzip-compressed payloads > 50KB.
- **Self-contained**: no monorepo workspace dependency on the app — its own `package.json`, `Dockerfile`, `tsconfig`.

```
                  ┌───── upstream APIs ─────────────────────────┐
                  │  OSSInsight, GH GraphQL, HN Algolia, Bluesky│
                  │  Reddit, dev.to, Lobsters, ProductHunt,     │
                  │  Tavily, Apify, arXiv, Kimi, NanoGPT, …     │
                  └────────────────┬────────────────────────────┘
                                   │
                                   ▼
                  ┌─ Fetcher.run(ctx) ──────────────────────────┐
                  │  - http via ctx.http (etag cache + retries) │
                  │  - read existing slug for merge             │
                  │  - union / dedupe / cap                     │
                  │  - writeDataStore(slug, payload)            │
                  └────────────────┬────────────────────────────┘
                                   │
                                   ▼  ss:data:v1:<slug>
                          TOOLBOX internal redis:6379
                                   │
                                   ▼
                  toolbox-trendingrepo-1 (Next.js app)
```

## Fetcher cadence (the daily routine)

Most fetchers run hourly at a staggered minute; a few have specialized cadences. See `src/registry.ts` for the full list.

| Fetcher | Cron | Output slug(s) |
|---|---|---|
| `oss-trending` | `22 * * * *` | `trending`, `hot-collections` |
| `recent-repos` | `25 * * * *` | `recent-repos` |
| `repo-metadata` | `13 * * * *` | `repo-metadata` (registry-aware as of 2026-05-27) |
| `repo-profiles` | `41 * * * *` | `repo-profiles` (AISO scan, TOP_LIMIT=20) |
| `consensus-trending` | `50 * * * *` | `consensus-trending` |
| `consensus-analyst` | `0 * * * *` | `consensus-verdicts` (Kimi K2.6, NanoGPT fallback, TOP_N=14) |
| `deltas` | `40 * * * *` | `deltas` |
| `collection-rankings` | `35 * * * *` | `collection-rankings` |
| `trendshift-daily` | `0 5 * * *` | `trendshift-daily` |
| `hackernews` | hourly | `hackernews-repo-mentions`, `hackernews-trending` |
| `bluesky` | hourly | `bluesky-mentions` |
| `devto` | every 6h | `devto-mentions`, `devto-trending` |
| `reddit` | paused | live OAuth collector disabled until HOSTUP has Reddit client credentials |
| `lobsters` | hourly | `lobsters-mentions` |
| `twitter` | hourly | `twitter-signals` (Nitter; needs APIFY_API_TOKEN for the Apify actor path) |
| `mentions-ledger` | `7,22,37,52 * * * *` | `mentions-ledger` snapshot (flattened from SADD/HINCRBY backing sets) |
| `cross-source-sweep` | `0 6 * * *` | `repo-mentions-detail-rollup` (countLifetime + top mentions) |
| **`repo-registry`** | `47 * * * *` | **`repo-registry`** (persistent accumulator, cap 2000 LRU) |
| `drop-intake-drain` | every minute | drains `queue:drop-a-repo` → POSTs to app's `/enrich` |
| `arxiv` | hourly | `arxiv-recent` |
| `ai-blogs` | hourly | `ai-blogs` |
| `lmarena` / `artificialanalysis` | daily | `aa-llms` |
| `manual-repos` | daily 04:07 UTC | `manual-repos` |
| `revenue-manual-matches` | daily 04:09 UTC | `revenue-manual-matches` |
| `funding-news` / `crunchbase` / `sec-form-d` | every 2h | `funding-news`, `funding-news-crunchbase`, `funding-news-sec` |
| `x-funding` | paused | `funding-news-x` disabled while Apify-only |
| `trustmrr` / `revenue-benchmarks` | daily | `trustmrr`, `revenue-benchmarks` |
| `reddit-baselines` | paused | paused with the rest of Reddit; do not schedule until the Reddit producer is re-enabled |
| `engagement-composite` | hourly | `engagement-composite` |
| `npm-downloads` / `pypi-downloads` / `npm-dependents` | daily | matching slugs |
| `hotness-snapshot` | hourly | `hotness-snapshot` |

## Data-store contract (`src/lib/redis.ts`)

```ts
writeDataStore(key, value, opts?) → { source: 'redis'|'skipped', writtenAt }
  // - namespace: `ss:data:v1:<key>`
  // - JSON.stringify, then gzip+base64 with `gz1:` prefix if > 50KB
  // - also writes `ss:meta:v1:<key>` with { writtenAt, writer: 'worker:<fetcherName>' }

readDataStore<T>(key) → T | null
  // - reads `ss:data:v1:<key>`, decompresses gz1:, JSON.parse
  // - returns null on miss / parse error
```

**Architectural rule**: every "where does this data come from?" question in the app should resolve to a `readDataStore('<slug>')` call. No `readFileSync` for new data sources.

## The `Fetcher` interface (`src/lib/types.ts`)

```ts
interface Fetcher {
  name: string;                 // must be unique in FETCHERS[]
  schedule: string;             // standard 5-field cron
  run(ctx: FetcherContext): Promise<RunResult>;
}

interface FetcherContext {
  log: pino.Logger;             // structured; LOG_LEVEL=warn in prod
  http: HttpClient;             // wraps fetch + retries + etag cache + timeout
  dryRun?: boolean;             // one-shot invocations can pass dryRun
}
```

## The collector pattern (read → union → dedupe → cap)

Every fetcher that maintains a slug follows this:

1. `readDataStore('<slug>')` to get the existing payload.
2. Union the existing rows with the freshly fetched ones (by stable id).
3. Dedupe; sort if relevant (newest first, score desc, etc.).
4. Cap: top-N OR LRU by last-seen.
5. `writeDataStore('<slug>', payload)`.

Never empty the cache: if the fetch yielded zero rows due to upstream failure, keep the existing payload — `min(50, existing.length)` is the floor. See [../../../docs/INGESTION.md](../../../docs/INGESTION.md) "Rule: keep-last-50".

The persistent `repo-registry` is the canonical example of this pattern at the largest scale (cap 2000, never-drop until LRU pressure). See `src/fetchers/repo-registry/index.ts`.

## Auto-activated channels in `cross-source-sweep`

The sweep logs a WARN `channel status` line every run:

```
hackernews:   live
bluesky:      live (or no-creds (BLUESKY_HANDLE/APP_PASSWORD))
producthunt:  snapshot (or no-snapshot)
tavily:       off (set TAVILY_API_KEY)  ← flips on with the env var
twitter:      off (set APIFY_API_TOKEN) ← flips to "apify·top40" with the env var
foldIn:       devto,hackernews,lobsters,bluesky
```

Drop `TAVILY_API_KEY` and/or `APIFY_API_TOKEN` into `/opt/toolbox-trendingrepo-worker/.env` + `docker compose up -d` to activate. Twitter via Apify is bounded to ONE batched actor run for the top-40 repos per sweep (not 150 per-repo runs) to cap cost.

## Anti-patterns (do not regress)

- **Live Reddit JSON / dev.to feed_content per-repo searches from this VPS are dead.** Reddit IP-blocks datacenters and remains paused; dev.to's `feed_content` endpoint returns `{"result":[]}` for everything. Use active source-first snapshots + `mentions-ledger` + the registry fold-in. See memory `reference_devto_reddit_dead_from_vps.md`.
- **Cookie-based Twitter scrapers are dead.** The Apify `apidojo~tweet-scraper` actor (gated behind `APIFY_API_TOKEN`) is the only viable path.
- **Don't sequential-loop `consensus-analyst`** — Kimi K2.6 averages ~80s/call; 14 sequential blows the hourly slot. Bounded concurrency (current default = 4).
- **Kimi For Coding endpoint requires `stream: true`** + a UA allowlist (`claude-cli`, `RooCode`, `Kilo-Code`). Non-stream calls hang. NanoGPT fallback is wired in `src/fetchers/consensus-analyst/llm.ts`.
- **Don't write fewer than `min(50, existing.length)` rows** to any slug — empties the cache. Always read-then-merge.
- **`loadTrackedRepos`** (`src/lib/util/tracked-repos.ts`) goes through `readDataStore` (gz1-aware). Don't add a raw `redis.get` + `JSON.parse` path — the `trending` slug is gzip-compressed; raw parse throws. (Fixed 2026-05-27 — see memory `project_tracked_repos_gzip_bug.md`.)

## One-shot invocation (for backfills + verification)

The worker entrypoint accepts a fetcher name as the second arg:

```bash
docker exec toolbox-trendingrepo-worker-1 node /app/dist/index.js <fetcher>
```

This runs `<fetcher>.run({log, http, dryRun: false})` once and exits, regardless of its schedule. Useful after a code change to seed prod without waiting for the next cron tick. Common targets: `repo-registry`, `mentions-ledger`, `cross-source-sweep`, `repo-metadata`.

## Testing

```bash
# from c:\dev\trendingrepo\apps\trendingrepo-worker
npx tsc --noEmit          # type check (~3s)
npx vitest run            # full vitest suite (≈4s, ~300 tests)
npx vitest run src/fetchers/<name>   # focused subsuite
```

The full project-level `npm test` from the app root runs node:test for app + invokes the worker's vitest separately.

## Build / deploy

See [../../../docs/DEPLOY-TOOLBOX.md](../../../docs/DEPLOY-TOOLBOX.md). Short form:

```bash
ssh toolbox
cd /opt/trendingrepo && git fetch && git checkout <sha> -- apps/trendingrepo-worker/src/
cd apps/trendingrepo-worker
TAG=vps-$(date +%Y%m%d%H%M%S)-<shortSha>
docker build -t toolbox-trendingrepo-worker:$TAG .
cd /opt/toolbox-trendingrepo-worker
sed -i "s#image: toolbox-trendingrepo-worker:.*#image: toolbox-trendingrepo-worker:$TAG#" docker-compose.yml
docker compose up -d
```
