# ENGINE.md — STARSCREENER Engine Registry

**Purpose**: One-stop concept/architecture map. Every Claude session loads this via the reference in [CLAUDE.md](../CLAUDE.md). When you (Claude or operator) need to know "what runs where, on what cadence, with which keys" — read this first.

**Last refreshed**: 2026-05-02 — after the production-hardening rollout (97 commits, 18 sub-agents).

---

## 1. Architecture in one paragraph

STARSCREENER ingests from ~15 external data sources, normalizes them through a single in-memory pipeline ([src/lib/pipeline](../src/lib/pipeline)), persists derived payloads to Redis (the `data-store`), and serves them via Next.js 15 App Router on Vercel. A sister Railway service ([apps/trendingrepo-worker](../apps/trendingrepo-worker)) runs ~37 background fetchers that share the same Redis. **62 GitHub Actions workflows** drive cron-triggered ingestion; the workflows commit refreshed `data/*.json` back to `main` (data-as-deploy lineage). The Vercel runtime reads from Redis with a three-tier fallback (Redis → bundled JSON → in-memory last-known-good) so the page never goes blank if Redis hiccups.

---

## 2. Two compute lanes

| Lane | Where | Trigger | Examples | Quota lane |
|---|---|---|---|---|
| **Runtime** | Vercel serverless (Lambdas) | User request, request-time API call | `/repo/[owner]/[name]`, `/compare`, `/api/pipeline/deltas` | `GITHUB_TOKEN` + `GH_TOKEN_POOL` (production pool) |
| **Cron / scrape** | GitHub Actions runners | `cron:` schedule in `.github/workflows/*.yml` | `scrape-trending.yml`, `collect-twitter.yml` | Each workflow gets its own PAT in repo Secrets — separate quota from runtime |
| **Worker** | Railway (`apps/trendingrepo-worker`) | Internal scheduler in worker code | MCP/Smithery/Skills/funding fetchers | Mostly worker-only env (Apify, DevTo pool, Firecrawl, Libraries.io, PulseMCP, Smithery) — but **shares `GITHUB_TOKEN`** with runtime → potential double-billing flag |

**Critical**: cron scripts are intentionally exempt from `lint:bypass` ([scripts/check-no-pool-bypass.mjs](../scripts/check-no-pool-bypass.mjs)) — they have their own PAT in CI Secrets. Runtime code (`src/`) MUST go through the pool.

---

## 3. External integrations registry

### 3a. GitHub (the core engine)
- **Hosts**: `api.github.com` (REST + GraphQL + search/code + search/repositories + search/issues), `api.github.com/repositories/<id>/contributors`
- **Runtime callers** (6, all pool-aware):
  - [src/lib/pipeline/adapters/github-adapter.ts](../src/lib/pipeline/adapters/github-adapter.ts) — main ingest
  - [src/lib/github-fetch.ts](../src/lib/github-fetch.ts) — generic helper
  - [src/lib/github-compare.ts](../src/lib/github-compare.ts) — `/compare` page (7 endpoints/request — heaviest single consumer)
  - [src/lib/github-user.ts](../src/lib/github-user.ts) — `/u/[handle]`
  - [src/lib/github-repo-homepage.ts](../src/lib/github-repo-homepage.ts) — repo metadata
  - [src/app/api/admin/stats/route.ts](../src/app/api/admin/stats/route.ts) — admin dashboard
  - Indirect: [social-adapters.ts](../src/lib/pipeline/adapters/social-adapters.ts), [stargazer-backfill.ts](../src/lib/pipeline/ingestion/stargazer-backfill.ts), [events-backfill.ts](../src/lib/pipeline/ingestion/events-backfill.ts)
- **Env**: `GITHUB_TOKEN` (single, slot 0) + `GH_TOKEN_POOL` (CSV, additional). Both merged + de-duped at boot.
- **Pool**: ✓ [src/lib/github-token-pool.ts](../src/lib/github-token-pool.ts) — singleton, 24h quarantine on 401, smart selection (highest remaining first, round-robin on ties), `GitHubTokenPoolExhaustedError` on full exhaustion (no silent degradation).
- **Per-PAT quota**: 5,000/hr authenticated. Reset is rolling (X-RateLimit-Reset header).
- **Cron-script bypasses** (intentional, separate quota lane): 11 scripts under `scripts/` use `process.env.GITHUB_TOKEN` directly — they run in CI with their own PAT.
- **Worker**: reads `process.env.GITHUB_TOKEN` (single) — does NOT use the runtime pool. **Flag**: if Railway's `GITHUB_TOKEN` is the same PAT that Vercel slot-0 uses, calls double-bill that PAT.
- **Observability today**: `/admin/pool` page (cookie-auth). Shows per-process snapshot. **Gaps**: no cross-lambda aggregate, no historical, no Sentry alerts on exhaustion, no cold-start hydration.

### 3b. Apify (Twitter, optional Reddit proxy)
- **Hosts**: `api.apify.com/v2/acts/<actor-id>/run-sync`, `api.apify.com/v2/key-value-stores`
- **Actor**: `apidojo~tweet-scraper` (Apify ID — see [CLAUDE.md anti-pattern](../CLAUDE.md))
- **Env**: `APIFY_API_TOKEN`, `APIFY_TWITTER_ACTOR`, `APIFY_PROXY_GROUPS`, `APIFY_PROXY_COUNTRY`
- **Pool**: ✗ single token. Apify pricing is per-account quota; rotation possible only with multiple Apify accounts.
- **Callers**: [scripts/_apify-twitter-provider.ts](../scripts/_apify-twitter-provider.ts) (CI), worker (Railway).
- **Cron**: `collect-twitter.yml` every 3h.
- **Per-call cost**: ~$0.30/1K tweets at default Apify pricing → daily run × 25 candidates × 4 queries × ~200 tweets = ~$6/day.

### 3c. ProductHunt
- **Host**: `api.producthunt.com/v2/api/graphql`
- **Env**: `PRODUCTHUNT_TOKEN` (single fallback) + **`PRODUCTHUNT_TOKENS`** (CSV, multi-key)
- **Pool**: ✓ round-robin in [scripts/scrape-producthunt.mjs](../scripts/scrape-producthunt.mjs) (`loadProducthuntTokens` + `_phCursor`). Per-token quota: ~6,250 req / 15-min window.
- **Cron**: 4×/day at `0 11,15,19,23 * * *` (matches PT-launches batch timing — daily at 4am, 8am, 12pm, 4pm PT).

### 3d. DevTo
- **Host**: `dev.to/api/articles`
- **Env**: `DEVTO_API_KEY` (single fallback) + **`DEVTO_API_KEYS`** (CSV, multi-key)
- **Pool**: ✓ round-robin in [apps/trendingrepo-worker/src/lib/sources/devto.ts](../apps/trendingrepo-worker/src/lib/sources/devto.ts) + [scripts/_devto-shared.mjs](../scripts/_devto-shared.mjs).
- **Cron**: every 6h.

### 3e. Reddit
- **Host**: `oauth.reddit.com/r/<subreddit>/...`
- **Env**: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` (OAuth-app credentials)
- **Pool**: ✗ — single OAuth app. Rotation would require multiple Reddit apps registered.
- **Cron**: `scrape-trending.yml` (hourly, includes Reddit) + `probe-reddit.yml` (manual). Optional Apify residential proxy for IP-block bypass (memory note: GHA IPs sometimes blocked by Reddit).
- **Per-app rate**: 60 req/min OAuth, 100 QPS-burst.

### 3f. Bluesky
- **Host**: `bsky.social/xrpc/...`, `api.bsky.app/xrpc/...`
- **Env**: `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` (bot account)
- **Pool**: ✗ — single bot account.
- **Cron**: `scrape-bluesky.yml` hourly.

### 3g. HuggingFace
- **Host**: `huggingface.co/api/models`, `huggingface.co/api/datasets`, `huggingface.co/api/spaces`
- **Env**: `HF_TOKEN` (single), `HF_CARD_FETCH_LIMIT`, `HF_SPACES_CARD_FETCH_LIMIT`
- **Pool**: ✗ — single token. (Per-IP unauth limits exist; authenticated has higher quota.)
- **Cron**: 3 workflows (`scrape-huggingface*.yml`) every 3h, staggered minutes.

### 3h. ArXiv
- **Host**: `arxiv.org/abs/...`, OAI-PMH endpoint
- **Env**: none (public)
- **Cron**: `scrape-arxiv.yml` every 3h, `enrich-arxiv.yml` every 6h.

### 3i. NPM
- **Host**: `api.npmjs.org/downloads/...`, `registry.npmjs.org/...`
- **Env**: none for downloads endpoint; `NPM_*` config knobs (search size, lag days)
- **Cron**: `scrape-npm.yml` daily, `refresh-npm-downloads.yml` every 6h.

### 3j. Lobsters
- **Host**: `lobste.rs/...`
- **Env**: none
- **Cron**: `scrape-lobsters.yml` hourly.

### 3k. OSS Insight (trending source of truth)
- **Host**: `api.ossinsight.io/v1/trends/repos/`, `api.ossinsight.io/v1/collections/`
- **Env**: none (free tier)
- **Cron**: driven by `scrape-trending.yml` hourly.

### 3l. Funding (worker-only sources)
- **Worker config**: see [apps/trendingrepo-worker/src/fetchers/funding](../apps/trendingrepo-worker/src/fetchers/funding) — pulls from Crunchbase-like signals via Firecrawl + Coingecko + Dune.
- **Env (worker)**: `FIRECRAWL_API_KEY`, `LIBRARIES_IO_API_KEY` (for OSS funding signals)
- **Cron**: `collect-funding.yml` every 6h.

### 3m. MCP-related (Smithery, PulseMCP)
- **Hosts**: `www.smithery.ai/api/...`, `api.pulsemcp.com/v0/...`
- **Env (worker)**: `SMITHERY_API_KEY`, `PULSEMCP_API_KEY`, `PULSEMCP_TENANT_ID`
- **Pool**: ✗ — single keys.
- **Cron**: 4 workflows (`refresh-mcp-*.yml`).

### 3n. Sentry, PostHog, Resend, Stripe, Trustmrr (services)
- **Sentry** (`agnt-pf` org, EU `de.sentry.io`, project id `4511285393686608`) — credentials in `SENTRY_*` env (not declared in env.ts schema currently).
- **Resend** — `RESEND_API_KEY` for digest emails.
- **Trustmrr** — `TRUSTMRR_API_KEY` for revenue overlay sync.
- **Stripe** — configured per CLAUDE.md but not actively billed.
- **PostHog** — referenced in cron uptime-monitor.yml (events posted to PostHog) but no first-party SDK lib in `src/lib/` yet (analytics gap, see optimization plan §6).

---

## 4. Cron schedule registry (62 workflows)

### High-frequency (every minute → every hour)

| Cadence | Workflow | Entry | Output |
|---|---|---|---|
| `*/5 * * * *` | uptime-monitor | (PostHog ping) | uptime metrics |
| `*/15 * * * *` | cron-freshness-check | (HTTP /api/cron/freshness-check) | fresh check |
| `0,30 * * * *` | cron-aiso-drain | (HTTP /api/cron/aiso-drain) | aiso queue drain |
| `5,35 * * * *` | cron-webhooks-flush | (HTTP /api/cron/webhooks-flush) | webhook delivery |
| `*/30 * * * *` | health-watch | scripts/check-source-health.mjs | breaker state |
| `10 * * * *` | cron-llm | (HTTP /api/cron/llm) | LLM-driven enrichment |
| `15 */2 * * *` | cron-pipeline-ingest | (HTTP /api/cron/pipeline-ingest) | mention store hydrate |
| `17 * * * *` | scrape-bluesky | scripts/scrape-bluesky.mjs | data/bluesky-* |
| `27 * * * *` | scrape-trending | scripts/scrape-trending.mjs --skip-collection-rankings | data/trending.json + cron-driven snapshots |
| `30 */6 * * *` | cron-pipeline-persist | (HTTP /api/cron/pipeline-persist) | mention store persist |
| `37 * * * *` | scrape-lobsters | scripts/scrape-lobsters.mjs | data/lobsters-* |
| `41 * * * *` | enrich-repo-profiles | scripts/enrich-repo-profiles.mjs --mode incremental --limit 50 | data/repo-profiles.json |

### Every 3 hours

| Cadence | Workflow | Output |
|---|---|---|
| `0 */3 * * *` | collect-twitter | .data/twitter-*.jsonl + (NEW) data/_meta/twitter.json |
| `13 */3 * * *` | scrape-huggingface | data/huggingface-*.json |
| `25 */3 * * *` | scrape-huggingface-datasets | data/huggingface-datasets.json |
| `35 */3 * * *` | scrape-huggingface-spaces | data/huggingface-spaces.json |
| `43 */3 * * *` | scrape-arxiv | data/arxiv-recent.json |

### Every 6 hours

| Cadence | Workflow | Output |
|---|---|---|
| `0 */6 * * *` | scrape-devto | data/devto-* |
| `0 */6 * * *` | collect-funding | data/funding-* |
| `5 */6 * * *` | refresh-skill-skillsmp | skill index |
| `11 */6 * * *` | refresh-mcp-smithery-rank | mcp-* |
| `12 */6 * * *` | refresh-skill-claude | skill index |
| `13 */6 * * *` | enrich-arxiv | enriched arxiv |
| `17 */6 * * *` | refresh-collection-rankings | trending collection ranks |
| `23 */6 * * *` | refresh-npm-downloads | npm dl |
| `30 */6 * * *` | refresh-skill-smithery | skill index |
| `37 */6 * * *` | refresh-pypi-downloads | pypi dl |
| `47 */6 * * *` | ping-mcp-liveness | mcp liveness |

### Every 12 hours

| Cadence | Workflow |
|---|---|
| `7 */12 * * *` | refresh-skill-derivatives |
| `45 */12 * * *` | refresh-skill-lobehub |

### Daily (single fire)

| Cadence | Workflow | Notes |
|---|---|---|
| `0 11,15,19,23 * * *` | scrape-producthunt | 4×/day, PT-cron-aligned |
| `0 2 * * *` | run-shadow-scoring + sweep-staleness | scoring shadow + staleness sweep |
| `0 3 * * *` | refresh-skill-install-snapshot | NEW (Phase 5 W5-SKILLS24H) |
| `0 4 * * *` | cron-pipeline-cleanup | mention pruning |
| `0 5 * * 0` | cron-pipeline-rebuild | weekly only |
| `0 6 * * *` | cron-predictions | LLM predictions |
| `0 8 * * 1` | cron-digest-weekly | Mondays |
| `0 14 * * *` | cron-twitter-outbound | replies |
| `13 3 * * *` | refresh-skill-forks-snapshot | |
| `17 3 * * *` | aiso-self-scan + refresh-star-activity | |
| `22 7 * * *` | scrape-claude-rss | |
| `23 4 * * *` | scrape-awesome-skills | |
| `25 3 * * *` | refresh-hotness-snapshot | |
| `27 2 * * *` | sync-trustmrr | revenue overlay sync |
| `30 3 * * *` | refresh-mcp-usage-snapshot | |
| `30 4 * * *` | promote-unknown-mentions | lake compaction |
| `31 4 * * *` | cron-agent-commerce | |
| `47 7 * * *` | scrape-openai-rss | |
| `50 23 * * *` | snapshot-top10-sparklines | |
| `53 4 * * *` | refresh-mcp-dependents | |
| `55 23 * * *` | snapshot-consensus + snapshot-top10 | |
| `17 9 * * *` | scrape-npm | |

### Manual / no schedule

`ci.yml`, `probe-reddit.yml`, `sentry-fix-bot.yml`, `trendingrepo-worker.yml` (typecheck-only on push), `audit-freshness.yml` (NEW — hourly + workflow_dispatch).

### Total daily invocation count

- **Per-minute** (uptime-monitor): 12,960 fires/day
- **Every 5–30 min** group: ~2,500 fires/day combined
- **Hourly** group (8 jobs): 192 fires/day
- **3-hourly** (5): 40 fires/day
- **6-hourly** (11): 44 fires/day
- **12-hourly** (2): 4 fires/day
- **Daily** (~22): 22 fires/day
- **Weekly** (1): 0.14 fires/day

**~15,750 cron fires per day** across the engine.

---

## 5. Refresh-cadence assessment

### Over-fetched (waste — could decrease)

| Source | Current | Upstream velocity | Recommendation | Quota saved/day |
|---|---|---|---|---|
| HuggingFace trending | every 3h (×3 workflows: trending + datasets + spaces) | refreshes ~daily on HF | drop to every 6h | ~24 calls/day per workflow × 3 = ~72 calls/day |
| ArXiv enrich | every 6h | papers post daily, scoring is stable | every 12h | ~50% reduction |
| MCP-Smithery rank | every 6h | rankings churn slowly | every 12h | ~50% reduction |
| Refresh-skill-* (6 workflows on `*/6`) | every 6h | skill index changes weekly | nightly | huge — these consume the most external quota |

### Under-fetched (gap — could increase)

| Source | Current | Upstream velocity | Recommendation |
|---|---|---|---|
| Reddit | hourly via scrape-trending | continuous post stream | hourly is reasonable but consider cluster-detection real-time stream for breakouts |
| Bluesky | hourly | similar | keep |
| ProductHunt | 4×/day at 11/15/19/23 PT | aligned with launch waves | keep — already optimal |
| GitHub trending (OSS Insight) | hourly | OSS Insight refreshes ~hourly | keep |

### Correctly-fetched (don't change)

- `scrape-trending` hourly — this is the heartbeat of the engine
- `scrape-arxiv` every 3h — papers cluster around ArXiv submission cron
- `scrape-producthunt` 4×/day at known PT windows
- `cron-pipeline-rebuild` weekly — destructive op

### Aggregate estimated savings if recommendations applied

- ~15-20% reduction in cron-driven external API calls
- ~3-5K commits/year saved on `data/*.json` (less deploy churn)

---

## 6. Optimization plan (combining §5 + the original 6 items from Mirko's prior question)

### Tier 1 — Ship now (observability + early-warning)

| # | Fix | Effort | Why it matters at 10K users |
|---|---|---|---|
| 1 | **Sentry on pool exhaustion + low-quota** — `captureException` on `GitHubTokenPoolExhaustedError`, `captureMessage(warning)` when any token <500 remaining | 15min | First page goes blank → operator gets paged before users complain |
| 2 | **Redis-backed pool aggregate** — write `{ tokenLabel, remaining, reset }` to Redis after every `recordRateLimit`. New `/admin/pool-aggregate` reads the fleet view (not per-process). | 1h | True fleet visibility across N lambdas |
| 3 | **PostHog `github_api_call` event** — fire per call with `tokenLabel + remaining + route + status`. Burn-rate dashboard. | 45min | Answers "where is quota going" in one chart |
| 4 | **Audit-freshness wired** — already shipped this session in `audit-freshness.yml` + `data/_meta/twitter.json`. | done | Apify SPOF detector live |

### Tier 2 — Worker-side parity (separation of concerns)

| # | Fix | Effort |
|---|---|---|
| 5 | **Worker pool migration for GitHub** — port `github-token-pool.ts` to worker. Accept SAME `GH_TOKEN_POOL` env; both sides round-robin separately (per-process state) → no double-billing because each side sees its own consumption | 2h |
| 6 | **Worker-side ProductHunt + DevTo pools shared** — already implemented worker-side. Verify both sides see the same `*_TOKENS` env in CI/Railway. | 30min audit |

### Tier 3 — Cron rate optimization (per §5 above)

| # | Fix | Effort |
|---|---|---|
| 7 | **Drop HuggingFace 3 workflows to every 6h** | 5min |
| 8 | **Drop refresh-skill-* group to nightly** | 10min |
| 9 | **Drop arxiv enrich to every 12h** | 5min |

### Tier 4 — Single-key services that could become pools

| # | Service | Current | Path to multi-key |
|---|---|---|---|
| 10 | HuggingFace | single `HF_TOKEN` | accept `HF_TOKENS` (CSV) — same pattern as DevTo |
| 11 | Apify | single account | requires multiple Apify accounts ($) — not free; flag as "scale option" |
| 12 | Firecrawl | single key | check if Firecrawl supports multi-key |

### Tier 5 — Analytics + feedback loop

| # | Fix | Effort |
|---|---|---|
| 13 | **PostHog `posthog-node` SDK in `src/lib/analytics/`** — first-party SDK so server-side route renders capture funnel events | 2h |
| 14 | **Stripe wire-up** — when monetization activates | TBD |

---

## 7. Sanity check the operator can run any time

```bash
# Pool size + utilization
curl https://trendingrepo.com/admin/pool   # auth-gated; shows N tokens + per-token health

# Last meta sidecar timestamps (which sources are fresh?)
ls -la data/_meta/*.json   # mtime per source
node scripts/audit-freshness.mjs   # NEW — fails CI if any source is stale beyond budget

# Cron fire count (since some N hours ago)
gh run list --limit 100 --json status,workflowName,createdAt | jq ...

# Lake — what GitHub repos are being mentioned that we don't yet track?
node scripts/promote-unknown-mentions.mjs   # writes data/unknown-mentions-promoted.json (top 200)
```

---

## 8. Anti-patterns documented elsewhere

This doc is the **engine map**. Operational anti-patterns (what NOT to do, with incident references) live in [CLAUDE.md](../CLAUDE.md) §"Anti-Patterns Already Burned". When in doubt about an action, read both this file (where am I) + that section (what kills production).

---

## 9. Where to look for what

| Question | Read first |
|---|---|
| What runs on a cron? | This file §4 |
| Which API keys exist? | This file §3 |
| How does the pipeline normalize signals? | [docs/ARCHITECTURE.md](ARCHITECTURE.md) |
| How do collectors write data? | [docs/INGESTION.md](INGESTION.md) |
| Which Twitter signals work? | [docs/TWITTER_SIGNAL_LAYER.md](TWITTER_SIGNAL_LAYER.md) |
| What's wrong right now? | Latest `docs/audit-*.md` (today's: ultra-audit-2026-05-02.md, audit-misleading-indicators-2026-05-02.md, audit-bundle-2026-05-02.md, audit-a11y-2026-05-02.md) |
| What's the history of incidents? | [CLAUDE.md](../CLAUDE.md) §"Anti-Patterns Already Burned" |
| What's queued for next session? | GitHub issues (currently open: #87 #88 #89) + audit doc Top-5 lists |
| Auto-memory the agent already has | [memory/MEMORY.md](../../.claude/projects/c--Users-mirko-OneDrive-Desktop-STARSCREENER/memory/MEMORY.md) |

---

## 10. Refresh discipline

This file is the **canonical engine map**. Every time the engine gains/loses a service or shifts a cadence by ≥2x, update this file in the same commit. The CLAUDE.md "Where to Look First" section references it — keeping it stale silently degrades every future Claude session's first move.

**Last refresh**: 2026-05-02 (initial). Next forced refresh: when worker-side pool migration lands (Tier 2), or after 30 days, whichever first.
