# 04 — Scoring Engines + Architecture Diagram

The engine has **two scoring systems** running in parallel — different stacks, different formulas, different update cadences. They are not yet reconciled.

---

## Main app scoring (Vercel runtime)

Source: [src/lib/pipeline/scoring/weights.ts](../../src/lib/pipeline/scoring/weights.ts) — **10 components**, default weights sum to exactly 1.0 (normalized after category override merge).

### Default weights

| Component | Default | What it measures |
|---|---:|---|
| `starVelocity24h` | 0.20 | stars added in last 24h |
| `starVelocity7d` | 0.15 | stars added in last 7d |
| `forkVelocity7d` | 0.08 | forks added in last 7d |
| `contributorGrowth30d` | 0.10 | new unique contributors in last 30d |
| `commitFreshness` | 0.12 | recency of last commit (decay) |
| `releaseFreshness` | 0.08 | recency of last GitHub release |
| `socialBuzz` | 0.12 | mentions across HN/Reddit/Bluesky/Twitter/DevTo/Lobsters |
| `issueActivity` | 0.05 | issue+PR activity rate |
| `communityHealth` | 0.05 | discussions, contributors, churn balance |
| `categoryMomentum` | 0.05 | category-wide trend (lifts repos in hot domains) |
| **Total** | **1.00** | |

### Category overrides

```typescript
// All shapes from src/lib/pipeline/scoring/weights.ts:33-92

ai-ml / ai-agents / local-llm:
  socialBuzz       → 0.18  (social validation matters more)
  starVelocity24h  → 0.15
  commitFreshness  → 0.07

mcp:                       (small ecosystem, fork-driven adoption)
  socialBuzz       → 0.18
  starVelocity24h  → 0.10  (24h spikes are noise at <500 stars)
  forkVelocity7d   → 0.13
  contributorGrowth30d → 0.14
  categoryMomentum → 0.10

devtools:                  (release/maintain signals dominate)
  commitFreshness  → 0.18
  releaseFreshness → 0.12
  socialBuzz       → 0.06

infra / databases:         (community size + contributor growth)
  communityHealth      → 0.10
  contributorGrowth30d → 0.15
  socialBuzz           → 0.04

security:                  (fresh patches paramount)
  releaseFreshness → 0.15
  commitFreshness  → 0.15
```

After merge, all weight maps are re-normalized via [`normalize()`](../../src/lib/pipeline/scoring/weights.ts) so the sum is exactly 1.0. Validation tolerance: 0.001 ([`validateWeights()`](../../src/lib/pipeline/scoring/weights.ts)).

### Where it runs
- Built into `getDerivedRepos()` ([src/lib/derived-repos.ts](../../src/lib/derived-repos.ts)) and the deeper pipeline at `src/lib/pipeline/scoring/`.
- Recomputes on demand at request time in the runtime; does NOT run on a cron.
- Token budget for V3 outputs gated by [scripts/check-v3-token-budget.mjs](../../scripts/check-v3-token-budget.mjs).

---

## Worker scoring (Supabase pg_cron)

Source: [apps/trendingrepo-worker/supabase/migrations/20260426000000_init.sql:120-180](../../apps/trendingrepo-worker/supabase/migrations/20260426000000_init.sql) — **5 components**, z-score-normalized per item type.

### Formula

```
trending_score =
    0.40 * z(downloads_7d)
  + 0.25 * z(velocity_delta_7d)
  + 0.20 * z(absolute_popularity)
  + 0.10 * recency_decay(last_modified, half_life=14d)
  + 0.05 * (cross_source_count / max_cross_source_count)
```

- Z-scores per type (skill, mcp, hf_model, hf_dataset, hf_space, repo, idea, arxiv_paper, blog_post)
- `n<2` or `stddev=0` zeroes that component (not infinity)
- `recency_decay = exp(-ln(2) * age_days / 14)` ∈ (0, 1]

### Where it runs
- pg_cron job `trending-recompute-nightly`, schedule `0 3 * * *`
- Function: `refresh_trending_score_history()` → `trending_score()` → `refresh materialized view concurrently trending_score_history`
- Materialized view stores **top-1000 per type per day** with rank (`trending_score_history` table).

### MCP score boost (migration 20260427)

Migration `20260427000000_mcp_score_boost.sql` applies an MCP-specific multiplier on top of the generic formula — small ecosystem, needs amplification.

---

## Shadow scoring

Source: [scripts/run-shadow-scoring.mjs](../../scripts/run-shadow-scoring.mjs), workflow [run-shadow-scoring.yml](../../.github/workflows/run-shadow-scoring.yml).

- **Schedule**: daily 02:00 UTC
- **Purpose**: A/B compare current weights vs proposed weight set without affecting prod scores
- **Output**: `data/scoring-shadow-report.json` → consumed by `/admin/scoring-shadow`
- **Why we keep it**: lets ops change weights deliberately; the shadow report shows top-N delta and rank shifts before promoting a new weight vector to default.

---

## Trustmrr revenue overlays

Sources tracked: [data/trustmrr-startups.json](../../data/trustmrr-startups.json), [data/revenue-overlays.json](../../data/revenue-overlays.json).

- **Sync**: [scripts/sync-trustmrr.mjs](../../scripts/sync-trustmrr.mjs) via [scripts/_trustmrr.mjs](../../scripts/_trustmrr.mjs)
- **Auth**: `TRUSTMRR_API_KEY`
- **Cadence**:
  - Full sync: daily at `27 2 * * *` UTC
  - Delta sync: hourly at `27 0,1,3,4,5,...,23 * * *` (24 entries, one per UTC hour)
- **Modes**: `--mode=full` vs `--mode=delta` (workflow chooses based on event)
- **Where it surfaces**: `/revenue`, `/tools/revenue-estimate`, `repo-profile.revenueOverlays`
- **Recent commit**: `b84096d1 chore(data): refresh trustmrr overlays 2026-05-03T05:43:18Z`

---

## Architecture diagram

```
                           ┌────────────────────────────────────────────────┐
                           │   E X T E R N A L   D A T A   S O U R C E S    │
                           └────────────────────────────────────────────────┘
  GitHub API   OSS Insight   Apify (Twitter)   ProductHunt   Dev.to   Reddit OAuth
  Bluesky      HuggingFace   arXiv             npm           Lobsters  HN-Algolia
  Smithery     PulseMCP      Glama             Firecrawl     Coingecko Dune  Solana RPC
  Trustmrr     OpenRouter    Artif.Analysis    Kimi          Anthropic Resend Stripe
  PostHog      Sentry
        │                                                                              ▲
        │ pulled by                                                                    │ posts
        │                                                                              │ events
        ▼                                                                              │
 ┌──────────────────────────────────────────────────────────────────────────────┐     │
 │             G H A   W O R K F L O W S   ( 6 2   T O T A L )                  │     │
 │                                                                              │     │
 │  GHA-direct lane (53):  scripts/scrape-* + scripts/refresh-* + scripts/      │     │
 │     │                   collect-* + scripts/snapshot-* + worker dispatcher   │     │
 │     │                   ├── writes data/*.json + data/_meta/*.json           │     │
 │     │                   ├── git push → Vercel auto-redeploy (Tier 2)         │     │
 │     │                   └── dual-writes Redis ss:data:v1:<slug>              │     │
 │                                                                              │     │
 │  HTTP-poll lane (9):   curl -H "Bearer $CRON_SECRET" .../api/cron/<route>    │     │
 │     │                   ├── /api/cron/aiso-drain (every 30 min)              │     │
 │     │                   ├── /api/cron/llm/{aggregate,sync-models}            │     │
 │     │                   ├── /api/cron/digest/weekly  (Resend → email)        │     │
 │     │                   ├── /api/cron/predictions    (LLM)                   │     │
 │     │                   ├── /api/cron/twitter-{daily,weekly-recap}           │     │
 │     │                   └── /api/cron/webhooks/{flush,scan}                  │     │
 │                                                                              │     │
 │  Manual (4): ci, probe-reddit, sentry-fix-bot (Anthropic), trendingrepo-     │     │
 │              worker (typecheck only)                                         │     │
 └──────────────────────────────────────────────────────────────────────────────┘     │
       │                                       │                                      │
       │ writes Redis                          │ HTTP                                 │
       ▼                                       ▼                                      │
 ┌─────────────────────────────────┐    ┌─────────────────────────────────────┐      │
 │   R E D I S   ( source of truth)│    │   V E R C E L   ( Next.js 15 )      │      │
 │   Railway ioredis OR Upstash    │    │                                     │      │
 │   REST (never both)             │    │   App Router (RSC + client islands) │      │
 │                                 │    │                                     │      │
 │   Keys:                         │◀───┤   src/lib/data-store.ts             │      │
 │     ss:data:v1:<slug>           │    │     ├── Tier 1: Redis read          │      │
 │     ss:meta:v1:<slug>           │    │     ├── Tier 2: bundled JSON        │──────┘
 │     ss:pool:gh:<tokenLabel>     │    │     └── Tier 3: in-memory LKG       │
 │     ss:rate-limit:*             │    │                                     │
 │     stripe-idem locks           │    │   src/lib/github-token-pool.ts      │
 │                                 │    │     ├── N PATs (env CSV pool)       │
 │                                 │    │     ├── 24h quarantine on 401       │
 │                                 │    │     ├── pick-highest-remaining      │
 │                                 │    │     └── Sentry alerts on exhaust    │
 │                                 │    │                                     │
 │                                 │    │   78 page.tsx routes                │
 │                                 │    │   /, /repo/[o]/[n], /twitter, ...   │
 └─────────────────┬───────────────┘    └─────────┬───────────────────────────┘
                   │                              │
                   │ shared fleet                 │ Sentry SDK (@sentry/nextjs 10.50)
                   ▼                              │  • DSN: SENTRY_DSN (org agnt-pf, EU)
 ┌─────────────────────────────────┐              │  • tracesSampleRate 0.1 prod
 │   R A I L W A Y   W O R K E R    │              │  • beforeSend dedupes net errors
 │   apps/trendingrepo-worker/      │              ▼
 │                                  │     ┌─────────────────────────┐
 │   53 fetcher dirs (own           │     │ S E N T R Y  (de.sentry.io) │
 │   internal scheduler):           │     │  org: agnt-pf              │
 │   funding/, mcp-*, smithery/,    │     │  project: 4511285393686608 │
 │   pulsemcp/, glama/, npm-*,      │     │  team: agnt                │
 │   skill-*, oss-trending/,        │     └─────────────────────────┘
 │   crunchbase/, x-funding/,       │
 │   recent-repos/, repo-metadata/, │
 │   reddit-baselines/, ...         │
 │                                  │
 │   Reads: Redis (shared)          │
 │   Writes: Supabase (own DB)      │
 │   Token: same GH PAT pool but    │
 │     own per-process state        │
 └─────────────────┬────────────────┘
                   │
                   │ @supabase/supabase-js
                   ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │   S U P A B A S E   (Postgres 15 + pg_cron)                          │
 │                                                                      │
 │   Tables:                                                            │
 │     trending_items     (uuid pk, type, source, slug, ...)            │
 │     trending_metrics   (daily snapshots, downloads_7d, stars_total)  │
 │     trending_assets    (logos, badges, thumbnails)                   │
 │   Materialized view:                                                 │
 │     trending_score_history  (top-1000/type/day, ranked)              │
 │   Functions:                                                         │
 │     trending_score()                                                 │
 │     refresh_trending_score_history()                                 │
 │   pg_cron:                                                           │
 │     'trending-recompute-nightly' @ 0 3 * * *                         │
 │                                                                      │
 │   RLS: service_role write, anon read-only.                           │
 └──────────────────────────────────────────────────────────────────────┘

       ┌──────────────────────────┐
       │   B R O W S E R          │   Zustand (watchlist, prefs) → localStorage
       │                          │   Cookies (admin auth session)
       │   78 page.tsx routes     │
       └──────────────────────────┘
```

---

## Critical observations

1. **Two scoring engines, two formulas**. The main app's 10-component composite (Vercel) and the worker's 5-component z-score formula (Supabase) are NOT reconciled. The user-facing `/` page reads main-app scoring. The worker output flows into Supabase tables that aren't queried by the main app. **Implication**: the worker's "trending" view is a parallel universe; its data is published to Supabase but consumed by what? Worth a follow-up — it likely powers something else (a planned `trendingrepo.com` API surface? See `docs/SITE-WIREMAP.md` mention of `/portal/docs`).
2. **Twitter is the SPOF**. Apify single-token + the audit-freshness gate is the only alarm. The 12h budget is generous (4 missed 3-hourly runs).
3. **GitHub-pool double-bill risk**. Both lanes (Vercel + worker) read `GITHUB_TOKEN`. If they share the same PAT, calls double-bill. ENGINE.md flags this; not yet resolved.
4. **`scrape-trending` is the heart**. One workflow at `27 * * * *` writes `data/trending.json`, which is the root of `getDerivedRepos()`, which feeds 11+ user-facing surfaces. If it's broken for two consecutive runs the audit-freshness gate fails (6h budget, 6 missed runs).
5. **PostHog has no first-party SDK** in `src/lib/`. Server-side route renders aren't captured in funnels. ENGINE.md §6 Tier 5 has this on the to-do list.
6. **Stripe is configured but inert** — wire-up planned, not active.
7. **`instrumentation.ts` is intentionally a no-op** due to a Turbopack 15.5 + Sentry 10.50 dev-server bug. Production webpack builds aren't affected.
8. **Two redis env conventions both supported** — `REDIS_URL` (Railway, preferred) OR `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash, legacy). The worker explicitly refuses both being set ([env.ts:68](../../apps/trendingrepo-worker/src/lib/env.ts)).

---

## Verification commands the operator can run

```bash
# Pool size + utilization (cookie-auth)
curl https://trendingrepo.com/admin/pool

# Last freshness sidecar timestamps
ls -la data/_meta/*.json

# Run the freshness gate locally
node scripts/audit-freshness.mjs

# Shadow scoring local run
node scripts/run-shadow-scoring.mjs

# Verify the data-store is wired (requires REDIS_URL set)
npm run verify:data-store

# Workflow runs since N hours ago
gh run list --limit 100 --json status,workflowName,createdAt
```
