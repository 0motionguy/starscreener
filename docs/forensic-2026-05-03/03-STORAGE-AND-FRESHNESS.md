# 03 — Storage Layers + Freshness

## Storage tiers in priority order

```
              READ                                    WRITE
              ────                                    ─────
            ┌─────────────────┐                  ┌──────────────────┐
            │ Tier 1: Redis   │ <───── primary ──┤ collectors        │
            │ ss:data:v1:*    │                  │ writeDataStore()  │
            │ ss:meta:v1:*    │                  │ + dual-mirror     │
            └────────┬────────┘                  └────────┬─────────┘
                     │ on miss                            │ also writes
            ┌────────▼────────┐                  ┌────────▼─────────┐
            │ Tier 2: file    │ <─ bundled JSON ─┤ data/*.json       │
            │ data/<slug>.json│   (cold-start    │ git-committed via │
            └────────┬────────┘    seed only)    │ workflows         │
                     │ on miss                   └──────────────────┘
            ┌────────▼────────┐
            │ Tier 3: memory  │
            │ MemoryCache     │ ← last-known-good per-process
            └─────────────────┘    fallback for Redis brownout
```

Implementation: [src/lib/data-store.ts:235](../../src/lib/data-store.ts) (`read()`), [data-store.ts:305](../../src/lib/data-store.ts) (`write()`).

**Invariant**: `read()` NEVER throws and NEVER returns null when ANY tier has data. Returns `{ data, source: "redis"|"file"|"memory"|"missing", ageMs, fresh, writtenAt }` so the UI can degrade gracefully.

**Public-data invariant (LIB-16)**: every payload routed through this cache is globally public. Cache key is bare slug; no tenant prefix. Tenant-scoped data must namespace the key.

---

## Tier 1 — Redis

- **Backend**: ioredis (Railway) when `REDIS_URL` set, Upstash REST when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` set, never both. Refinement guard at [apps/trendingrepo-worker/src/lib/env.ts:68](../../apps/trendingrepo-worker/src/lib/env.ts).
- **Key namespaces**:
  - `ss:data:v1:<slug>` — payload (JSON-stringified)
  - `ss:meta:v1:<slug>` — `writtenAt` ISO timestamp
  - Plus token-pool aggregate keys (see [04-SCORING-AND-DIAGRAM.md](04-SCORING-AND-DIAGRAM.md))
- **Lifecycle**: written by collectors via [scripts/_data-store-write.mjs](../../scripts/_data-store-write.mjs). Read by server components / route handlers via `refreshXxxFromStore()` hooks.
- **TTL**: none by default (Redis keeps until overwritten). Per-key override via `opts.ttlSeconds`.
- **ioredis tuning**: `maxRetriesPerRequest: 3`, `connectTimeout: 5_000`, `commandTimeout: 30_000`, `enableOfflineQueue: true`. Without `commandTimeout`, snapshot scripts were being cancelled at 6h instead of failing fast (audit 2026-05-04).
- **Singleton**: `getDataStore()` at [data-store.ts:594](../../src/lib/data-store.ts).

---

## Tier 2 — Bundled JSON files (`data/`)

44 top-level files (verified `ls data/*.json | wc -l`). Each is the cold-start seed; live truth is Redis after first warm read.

| File | Writer cron / source | Reader |
|---|---|---|
| `data/agent-commerce.json` | cron-agent-commerce.yml daily | `/agent-commerce/*` |
| `data/arxiv-enriched.json` | enrich-arxiv.yml every 12h | `/research`, `/repo/*` |
| `data/arxiv-recent.json` | scrape-arxiv.yml every 3h | `/arxiv/trending`, `/papers` |
| `data/awesome-skills.json` | scrape-awesome-skills.yml daily | `/skills` |
| `data/bluesky-mentions.json` | scrape-bluesky.yml hourly | `/bluesky/trending`, breakouts |
| `data/bluesky-trending.json` | scrape-bluesky.yml hourly | `/signals`, breakouts |
| `data/claude-rss.json` | scrape-claude-rss.yml daily | `/model-usage` |
| `data/collection-rankings.json` | refresh-collection-rankings.yml every 6h | `/collections` |
| `data/company-logos.json` | manual / supabase data | logos in derived-repos |
| `data/deltas.json` | computed in GHA from git history of trending.json | trending delta numbers |
| `data/devto-mentions.json` | scrape-devto.yml every 6h | `/devto`, breakouts |
| `data/devto-trending.json` | scrape-devto.yml every 6h | `/signals` |
| `data/funding-aliases.json` | collect-funding.yml every 6h | funding name normalization |
| `data/funding-news.json` | collect-funding.yml every 6h | `/funding` |
| `data/funding-seeds.json` | collect-funding.yml every 6h | known-funded seed list |
| `data/hackernews-repo-mentions.json` | scrape-trending.yml hourly (HN sidecar) | `/hackernews/trending` |
| `data/hackernews-trending.json` | scrape-trending.yml hourly | `/signals` |
| `data/hot-collections.json` | refresh-collection-rankings.yml | hot collections widget |
| `data/huggingface-datasets.json` | scrape-huggingface-datasets.yml every 6h | `/huggingface/datasets` |
| `data/huggingface-spaces.json` | scrape-huggingface-spaces.yml every 6h | `/huggingface/spaces` |
| `data/huggingface-trending.json` | scrape-huggingface.yml every 6h | `/huggingface/trending` |
| `data/lobsters-mentions.json` | scrape-lobsters.yml hourly | `/lobsters`, repo profile |
| `data/lobsters-trending.json` | scrape-lobsters.yml hourly | `/signals` |
| `data/manual-repos.json` | manual curation (operator JSON via raw.github URL) | discovery seed |
| `data/mcp-liveness.json` | ping-mcp-liveness.yml every 6h | `/mcp` liveness pill |
| `data/npm-manual-packages.json` | manual curation | npm seed list |
| `data/npm-packages.json` | scrape-npm.yml daily + refresh-npm-downloads.yml every 6h | `/npm` |
| `data/openai-rss.json` | scrape-openai-rss.yml daily | `/model-usage` |
| `data/producthunt-launches.json` | scrape-producthunt.yml 4×/day | `/producthunt` |
| `data/recent-repos.json` | refresh-hotness-snapshot.yml hourly | `/breakouts`, recent repo widget |
| `data/reddit-all-posts.json` | scrape-reddit.mjs (embedded in scrape-trending) | reddit-all data |
| `data/reddit-baselines.json` | refresh-reddit-baselines.yml weekly Mon | cross-signal threshold |
| `data/reddit-mentions.json` | scrape-trending.yml hourly | `/reddit/trending`, breakouts |
| `data/repo-metadata.json` | fetch-repo-metadata.mjs (manual + cron) | repo metadata join |
| `data/repo-profiles.json` | enrich-repo-profiles.yml hourly :41 | `/u/[handle]`, profile completeness |
| `data/revenue-benchmarks.json` | compute-revenue-benchmarks.mjs | revenue tooltips |
| `data/revenue-manual-matches.json` | manual operator JSON | revenue overlay manual matches |
| `data/revenue-overlays.json` | sync-trustmrr.yml daily + hourly delta | `/revenue` |
| `data/scoring-shadow-report.json` | run-shadow-scoring.yml daily 02:00 UTC | `/admin/scoring-shadow` |
| `data/staleness-report.json` | sweep-staleness.yml daily 02:00 UTC | `/admin/staleness` |
| `data/trending.json` | scrape-trending.yml hourly :27 | `/`, derived-repos (root) |
| `data/trustmrr-startups.json` | sync-trustmrr.yml | `/revenue` |
| `data/unknown-mentions-promoted.json` | promote-unknown-mentions.yml daily 04:30 UTC | `/admin/unknown-mentions` |
| `data/webhook-targets.json` | (written by webhook flush job) | webhook delivery |

Subdirs:
- `data/_meta/` — 16 freshness sidecars (see below)
- `data/collections/` — per-collection breakdowns
- `data/tier-lists/` — persisted user tierlists

---

## Tier 2b — Append-only JSONL (`.data/`)

3 files, all Twitter-related. Whitelisted in `.gitignore`. Written by GHA collectors that `git push` after each scan.

| File | Writer | Use |
|---|---|---|
| `.data/twitter-scans.jsonl` | collect-twitter.yml every 3h | raw scan rows (one per Apify run) |
| `.data/twitter-repo-signals.jsonl` | collect-twitter.yml | per-repo aggregated signal |
| `.data/twitter-ingestion-audit.jsonl` | collect-twitter.yml | audit trail (which queries fired, what came back) |

Aggregator (e.g. `/twitter` page) dedupes downstream — never replace, only append.

---

## `data/_meta/` — freshness sidecars (16 files)

Per-source metadata mirror, written by [scripts/_data-meta.mjs:writeSourceMeta](../../scripts/_data-meta.mjs):

```json
{
  "source": "twitter",
  "reason": "ok|empty_results|network_error|partial",
  "ts": "2026-05-03T05:52:33Z",
  "count": 51,
  "durationMs": 12340,
  "error": null,
  "extra": {}
}
```

Files: `arxiv.json`, `awesome-skills.json`, `bluesky.json`, `claude-rss.json`, `devto.json`, `funding-news.json`, `hackernews.json`, `huggingface.json`, `huggingface-datasets.json`, `huggingface-spaces.json`, `lobsters.json`, `npm.json`, `openai-rss.json`, `producthunt.json`, `reddit.json`, `trending.json`. (Twitter has its own at `data/_meta/twitter.json` per audit-freshness.)

**Critical for the freshness gate** — the audit script reads only these, not the main payload files, so freshness ≠ payload identity.

---

## Tier 3 — Memory (last-known-good)

[`MemoryCache`](../../src/lib/data-store.ts) at [data-store.ts:139](../../src/lib/data-store.ts). Per-Lambda-process. Holds the most recent successful read per slug. Drains every cold start.

Used as the third-tier fallback when Redis brownouts AND file is missing — page keeps rendering whatever it last saw.

---

## Supabase (worker-only)

Auth: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE`. Client at [apps/trendingrepo-worker/src/lib/db.ts](../../apps/trendingrepo-worker/src/lib/db.ts).

### Tables

```sql
-- 4 tables + 1 materialized view + 2 functions
-- Schema source: apps/trendingrepo-worker/supabase/migrations/20260426000000_init.sql

create type trending_item_type as enum (
  'skill','mcp','hf_model','hf_dataset','hf_space','repo','idea'
);

create table trending_items (
  id              uuid primary key,
  type            trending_item_type,
  source          text,
  source_id       text,
  slug            text,
  title           text,
  description     text,
  url             text,
  author          text,
  vendor          text,
  agents          text[],
  tags            text[],
  language        text,
  license         text,
  thumbnail_url   text,
  trending_score  double precision,
  absolute_popularity double precision,
  cross_source_count int,
  first_seen_at   timestamptz,
  last_seen_at    timestamptz,
  last_modified_at timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz,
  raw             jsonb,
  unique (source, source_id)
);

create table trending_metrics (
  id                bigserial,
  item_id           uuid,         -- FK trending_items
  captured_at       timestamptz,
  downloads_total   bigint,
  downloads_7d      bigint,
  stars_total       bigint,
  installs_total    bigint,
  upvotes           int,
  comments          int,
  velocity_delta_7d double precision,
  source_rank       int,
  raw               jsonb,
  unique (item_id, captured_at::date)  -- one row per item per day
);

create table trending_assets (
  id                uuid primary key,
  item_id           uuid,         -- FK trending_items
  kind              text,         -- 'logo'|'badge'|'thumbnail'|'banner'
  url               text,
  alt               text,
  simple_icons_slug text,
  brand_color       text,
  bytes             bigint,
  content_type      text,
  fetched_at        timestamptz,
  raw               jsonb
);

create materialized view trending_score_history as
  select snapshot_date, type, item_id, slug, title, url, trending_score, rank
  from (
    select date_trunc('day', now())::date as snapshot_date,
           i.type, i.id as item_id, i.slug, i.title, i.url, i.trending_score,
           rank() over (partition by i.type order by i.trending_score desc) as rank
    from trending_items i
    where i.last_seen_at > now() - interval '30 days'
  ) s where rank <= 1000;
```

### RLS policies

- `service_role` (worker): all CRUD bypass
- `anon` (public reader): SELECT only

### pg_cron schedule (database-side, not GHA)

```sql
select cron.schedule(
  'trending-recompute-nightly',
  '0 3 * * *',
  $$ select refresh_trending_score_history(); $$
);
```

### Migrations

- `20260426000000_init.sql` — initial schema
- `20260427000000_mcp_score_boost.sql` — MCP-specific score adjustment
- `20260428000000_arxiv_paper_type.sql` — arxiv_paper as a type
- `20260429000000_blog_post_type.sql` — blog_post as a type
- `seed.sql` — seed data

### Worker write entry points

- `upsertItem(db, { item, trendingScoreApprox })` — upserts into `trending_items` on `(source, source_id)` conflict
- `writeMetric(db, itemId, metric)` — daily metric snapshot
- `upsertAsset(db, { item_id, kind, url, ... })` — logo/badge attachment

---

## Client-side (browser) storage

- **Zustand stores** — `useWatchlistStore` etc., persisted to `localStorage`. UI: `/watchlist`, etc.
- **Cookies** — admin auth session (per CLAUDE.md, commit `e2a0908`).
- **No service worker** — no offline cache layer.

---

## Freshness flow

```
collector script
   │
   ├──> writes data/<slug>.json          (Tier 2)
   ├──> writes data/_meta/<slug>.json    (sidecar, via writeSourceMetaFromOutcome)
   └──> writes Redis ss:data:v1:<slug> + ss:meta:v1:<slug>  (Tier 1)

audit-freshness.yml (hourly :00, gha-direct)
   │
   └──> reads data/_meta/*.json
        │
        ├── REQUIRED sources (hackernews, reddit, trending) — missing = FAIL
        ├── budget exceeded — FAIL (twitter 12h, hn/reddit/bluesky 6h, devto/arxiv/hf/npm 24h)
        └── workflow exits non-zero → CI alert visible in Actions tab + OPS_ALERT_WEBHOOK

sweep-staleness.yml (daily 02:00 UTC, gha-direct)
   │
   └──> reads each data/<slug>.json
        │
        ├── classifies records by `lastRefreshedAt` field (per-record granularity)
        ├── thresholds: fast=4h, producthunt=16h, devto=26h, npm=50h
        └── writes data/staleness-report.json → /admin/staleness reads it
```

### Per-source budgets (hourly gate)

From [scripts/audit-freshness.mjs:28-45](../../scripts/audit-freshness.mjs):

| Source | Budget | Cron cadence | Implied tolerance |
|---|---|---|---|
| `twitter` | 12h | every 3h | 4 missed runs |
| `hackernews` | 6h | hourly (via scrape-trending) | 6 missed runs |
| `reddit` | 6h | hourly | 6 missed runs |
| `bluesky` | 6h | hourly | 6 missed runs |
| `trending` | 6h | hourly | 6 missed runs |
| `lobsters` | 12h | hourly | 12 missed runs |
| `devto` | 24h | every 6h | 4 missed runs |
| `producthunt` | 12h | 4×/day | 4 missed runs |
| `arxiv` | 24h | every 3h | 8 missed runs |
| `huggingface` (and `-datasets`, `-spaces`) | 24h | every 6h | 4 missed runs |
| `npm` | 24h | daily | 1 missed run |
| `funding-news` | 24h | every 6h | 4 missed runs |
| (anything else) | 24h fallback | (per cron) | n/a |

### REQUIRED sources

Set: `hackernews`, `reddit`, `trending`. Missing meta file = automatic failure even if budget would have permitted it. From [scripts/audit-freshness.mjs:50-54](../../scripts/audit-freshness.mjs).

### UI freshness display

- `getLastFetchedAt()` per source — example: [src/lib/trending.ts:50](../../src/lib/trending.ts) reads `data.fetchedAt` from the in-memory cache (which `refreshTrendingFromStore` populates from Redis on demand).
- Component: [`<StalenessBadge>`](../../src/components/StalenessBadge.tsx) (cf. SITE-WIREMAP.md fan-out).
- Admin: `/admin/staleness` reads `data/staleness-report.json` directly.

---

## Sources currently tracked by sweep-staleness

From [scripts/sweep-staleness.mjs:43-112](../../scripts/sweep-staleness.mjs): `trending`, `repo-profiles`, `huggingface-trending`, `huggingface-datasets`, `huggingface-spaces`, `npm-packages`, `producthunt-launches`, `devto-trending` (8 sources). The latest report (verified 2026-05-03 05:33 UTC) shows 0 stale records but notes `lastRefreshedAt` is missing on all rows ("pre-B2 data, recount on next cron").
