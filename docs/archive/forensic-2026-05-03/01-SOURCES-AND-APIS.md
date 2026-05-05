# 01 — Every External Source & API Connection

For each source: auth env var(s), caller file paths, endpoint URLs, pool/single-key status, driving cron(s).

Two compute lanes consume these:
- **Vercel runtime** (`src/lib/*`, `src/app/api/*`) — request-time calls, pool-aware where the pool exists.
- **GitHub Actions cron** (`scripts/*`) — has its own PAT in CI Secrets; intentionally exempt from the runtime pool.
- **Railway worker** (`apps/trendingrepo-worker/src/fetchers/*`) — internal scheduler, shares Redis with main app, writes Supabase.

---

## 1. GitHub (the engine's spine)

- **Auth**: `GITHUB_TOKEN` (single, slot 0) + `GITHUB_TOKEN_POOL` (CSV, additional slots). Workflow files also accept `GH_TOKEN_POOL` and `GH_PAT_DEFAULT` as aliases.
- **Hosts**: `api.github.com` (REST + GraphQL + search/code/repositories/issues), `api.github.com/repositories/<id>/contributors`
- **Rate limit**: 5000/hr per authenticated PAT, rolling reset via `X-RateLimit-Reset`.
- **Pool implementation**: [src/lib/github-token-pool.ts](../../src/lib/github-token-pool.ts) — singleton, picks healthiest token (highest `remaining`), 24h `quarantine` on 401, Sentry-integrated:
  - [github-token-pool.ts:305](../../src/lib/github-token-pool.ts) — `GitHubTokenPoolExhaustedError` → `Sentry.captureException` with `pool=github` tag
  - [github-token-pool.ts:369](../../src/lib/github-token-pool.ts) — low-quota (<500) → `Sentry.captureMessage` with hysteresis (won't refire until recovery to >1000)
  - [github-token-pool.ts:395](../../src/lib/github-token-pool.ts) — quarantine (401) → `Sentry.captureMessage` level `error`
  - [github-token-pool.ts:423](../../src/lib/github-token-pool.ts) — `hydrateFromRedis()` cold-start hydrate so sibling lambdas share state
- **Runtime callers (pool-aware)**: 6 lib files
  - [src/lib/pipeline/adapters/github-adapter.ts](../../src/lib/pipeline/adapters/github-adapter.ts) — main ingest
  - [src/lib/github-fetch.ts](../../src/lib/github-fetch.ts) — generic helper
  - [src/lib/github-compare.ts](../../src/lib/github-compare.ts) — `/compare` route (7 endpoints/request — heaviest single consumer)
  - [src/lib/github-user.ts](../../src/lib/github-user.ts) — `/u/[handle]`
  - [src/lib/github-repo-homepage.ts](../../src/lib/github-repo-homepage.ts)
  - [src/app/api/admin/stats/route.ts](../../src/app/api/admin/stats/route.ts) — admin dashboard
  - Indirect: [social-adapters.ts](../../src/lib/pipeline/adapters/social-adapters.ts), [stargazer-backfill.ts](../../src/lib/pipeline/ingestion/stargazer-backfill.ts), [events-backfill.ts](../../src/lib/pipeline/ingestion/events-backfill.ts)
- **Cron-script bypasses (intentional, separate quota lane)**: 11 scripts under `scripts/` use `process.env.GITHUB_TOKEN` directly. Lint guard [scripts/check-no-pool-bypass.mjs](../../scripts/check-no-pool-bypass.mjs) keeps `src/` honest. Mini-pool helper for cron: [scripts/_github-token-pool-mini.mjs](../../scripts/_github-token-pool-mini.mjs).
- **Worker overlap**: [apps/trendingrepo-worker/src/lib/env.ts](../../apps/trendingrepo-worker/src/lib/env.ts) reads `GITHUB_TOKEN` + `GH_TOKEN_POOL` + `GITHUB_TOKEN_POOL` — does NOT use the runtime pool, separate per-process state. **Risk**: if Railway's `GITHUB_TOKEN` is the same PAT as Vercel slot-0, calls double-bill that PAT. Documented in [ENGINE.md §3a](../ENGINE.md).
- **Observability today**: `/admin/pool` (cookie-auth, per-process snapshot). `/admin/pool-aggregate` reads Redis fleet view via `publishTokenStateToRedis`.

---

## 2. OSS Insight (trending source of truth)

- **Auth**: none (free public API)
- **Hosts**: `api.ossinsight.io/v1/trends/repos/`, `api.ossinsight.io/v1/collections/`
- **Caller**: [scripts/scrape-trending.mjs](../../scripts/scrape-trending.mjs)
- **Cron**: `scrape-trending.yml` hourly at `27 * * * *` (skip-collection-rankings flag) + `refresh-collection-rankings.yml` every 6h at `17 */6 * * *` (only-collection-rankings flag).
- **Output**: `data/trending.json` (3-tier read via data-store).
- **Blast radius**: 11+ user-facing surfaces depend on `getDerivedRepos()` which reads this.

---

## 3. Apify Twitter (single point of failure)

- **Auth**: `APIFY_API_TOKEN` (single Apify account)
- **Optional**: `APIFY_PROXY_GROUPS`, `APIFY_PROXY_COUNTRY`, `APIFY_TWITTER_ACTOR` (defaults to `apidojo~tweet-scraper`)
- **Hosts**: `api.apify.com/v2/acts/<actor-id>/run-sync`, `api.apify.com/v2/key-value-stores`
- **Caller**: [scripts/_apify-twitter-provider.ts](../../scripts/_apify-twitter-provider.ts), [scripts/collect-twitter-signals.ts](../../scripts/collect-twitter-signals.ts)
- **Cron**: `collect-twitter.yml` every 3h `0 */3 * * *`. Direct mode (writes `.data/*.jsonl` + `git push`).
- **Output**: `.data/twitter-scans.jsonl`, `.data/twitter-repo-signals.jsonl`, `.data/twitter-ingestion-audit.jsonl`, plus freshness sidecar `data/_meta/twitter.json`.
- **Cost**: ~$0.30/1K tweets at default Apify pricing → ~$6/day at current scan rate.
- **Anti-pattern**: do NOT switch back to API mode (Vercel ephemeral filesystem silently loses writes — burned 2026-04-25).
- **Pool**: ✗ single token. Multi-key requires multiple Apify accounts ($).
- **Backup secret**: `TWITTER_WEB_ACCOUNTS_JSON` (cookie-based fallback, dead post-2026 anti-bot but env still wired).
- **SPOF alarm**: [scripts/audit-freshness.mjs:31](../../scripts/audit-freshness.mjs) sets a **12h budget** for the `twitter` source. Audit-freshness workflow runs hourly and exits non-zero if budget exceeded.

---

## 4. ProductHunt (multi-key pool)

- **Auth**: `PRODUCTHUNT_TOKEN` (single fallback) + `PRODUCTHUNT_TOKENS` (CSV multi-key)
- **Host**: `api.producthunt.com/v2/api/graphql`
- **Caller**: [scripts/scrape-producthunt.mjs](../../scripts/scrape-producthunt.mjs), shared at [scripts/_ph-shared.mjs](../../scripts/_ph-shared.mjs)
- **Pool**: ✓ round-robin via `loadProducthuntTokens` + `_phCursor`. Per-token quota: ~6,250 req / 15-min window.
- **Cron**: `scrape-producthunt.yml` 4×/day at `0 11,15,19,23 * * *` (PT-aligned launch waves).
- **Output**: `data/producthunt-launches.json`.

---

## 5. Dev.to (multi-key pool)

- **Auth**: `DEVTO_API_KEY` (single fallback) + `DEVTO_API_KEYS` (CSV)
- **Host**: `dev.to/api/articles`
- **Caller**: [scripts/scrape-devto.mjs](../../scripts/scrape-devto.mjs), shared at [scripts/_devto-shared.mjs](../../scripts/_devto-shared.mjs); worker side at [apps/trendingrepo-worker/src/lib/sources/devto.ts](../../apps/trendingrepo-worker/src/lib/sources/devto.ts).
- **Pool**: ✓ round-robin (both sides).
- **Cron**: `scrape-devto.yml` every 6h `0 */6 * * *`.
- **Output**: `data/devto-mentions.json`, `data/devto-trending.json`.

---

## 6. Reddit (single OAuth app)

- **Auth**: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` (OAuth-app credentials, not user OAuth)
- **Host**: `oauth.reddit.com/r/<subreddit>/...`
- **Caller**: [scripts/scrape-reddit.mjs](../../scripts/scrape-reddit.mjs), [scripts/_reddit-shared.mjs](../../scripts/_reddit-shared.mjs); also embedded in `scrape-trending.mjs`.
- **Pool**: ✗ — single OAuth app (rotation requires multiple Reddit apps).
- **Cron**: embedded in `scrape-trending.yml` hourly + `refresh-reddit-baselines.yml` weekly Mondays + `probe-reddit.yml` (manual diagnostic).
- **Per-app rate**: 60 req/min OAuth, 100 QPS-burst.
- **GHA IPs sometimes blocked**: optional fallback via Apify residential proxy.

---

## 7. Bluesky (single bot)

- **Auth**: `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`
- **Hosts**: `bsky.social/xrpc/...`, `api.bsky.app/xrpc/...`
- **Caller**: [scripts/scrape-bluesky.mjs](../../scripts/scrape-bluesky.mjs), [scripts/_bluesky-shared.mjs](../../scripts/_bluesky-shared.mjs)
- **Pool**: ✗ single bot.
- **Cron**: `scrape-bluesky.yml` hourly `17 * * * *`.
- **Output**: `data/bluesky-mentions.json`, `data/bluesky-trending.json`.

---

## 8. HuggingFace (single token)

- **Auth**: `HF_TOKEN` + tunables `HF_CARD_FETCH_LIMIT`, `HF_SPACES_CARD_FETCH_LIMIT`
- **Hosts**: `huggingface.co/api/models`, `huggingface.co/api/datasets`, `huggingface.co/api/spaces`
- **Callers**: [scripts/scrape-huggingface.mjs](../../scripts/scrape-huggingface.mjs), `-datasets.mjs`, `-spaces.mjs`; [scripts/_huggingface-shared.mjs](../../scripts/_huggingface-shared.mjs)
- **Pool**: ✗ single token.
- **Cron**: 3 workflows on every-6h cadence (post 2026-05-02 cuts):
  - `scrape-huggingface.yml` — `13 */6 * * *`
  - `scrape-huggingface-datasets.yml` — `25 */6 * * *`
  - `scrape-huggingface-spaces.yml` — `35 */6 * * *`
- **Outputs**: `data/huggingface-trending.json`, `huggingface-datasets.json`, `huggingface-spaces.json`.

---

## 9. arXiv (public)

- **Auth**: none
- **Hosts**: `arxiv.org/abs/...`, OAI-PMH endpoint
- **Callers**: [scripts/scrape-arxiv.mjs](../../scripts/scrape-arxiv.mjs), [scripts/enrich-arxiv.mjs](../../scripts/enrich-arxiv.mjs), [scripts/ingest-arxiv-cited-repos.mjs](../../scripts/ingest-arxiv-cited-repos.mjs)
- **Cron**: `scrape-arxiv.yml` `43 */3 * * *`, `enrich-arxiv.yml` `13 */12 * * *`.
- **Outputs**: `data/arxiv-recent.json`, `data/arxiv-enriched.json`.

---

## 10. npm (public)

- **Auth**: none for downloads endpoint; tunables `NPM_SEARCH_SIZE`, `NPM_CANDIDATE_LIMIT`, `NPM_TOP_LIMIT`, `NPM_DOWNLOAD_LAG_DAYS`, `NPM_DISCOVERY_QUERIES`, `NPM_DOWNLOAD_END_DATE`.
- **Hosts**: `api.npmjs.org/downloads/...`, `registry.npmjs.org/...`
- **Callers**: [scripts/scrape-npm.mjs](../../scripts/scrape-npm.mjs), [scripts/scrape-npm-daily.mjs](../../scripts/scrape-npm-daily.mjs)
- **Cron**: `scrape-npm.yml` daily `17 9 * * *`, `refresh-npm-downloads.yml` `23 */6 * * *`.
- **Output**: `data/npm-packages.json`.

---

## 11. Lobsters (public)

- **Auth**: none
- **Host**: `lobste.rs/...`
- **Caller**: [scripts/scrape-lobsters.mjs](../../scripts/scrape-lobsters.mjs)
- **Cron**: `scrape-lobsters.yml` hourly `37 * * * *`.

---

## 12. Hacker News Algolia (public)

- **Auth**: none
- **Host**: `hn.algolia.com/api/v1/search`
- **Caller**: [scripts/scrape-hackernews.mjs](../../scripts/scrape-hackernews.mjs), [scripts/_hn-shared.mjs](../../scripts/_hn-shared.mjs); embedded in `scrape-trending.mjs`.
- **Cron**: hourly via `scrape-trending.yml`.

---

## 13. Funding sources (worker-only)

The Railway worker hosts a fan-out fetcher set. Listed by ENV + endpoint:

| Source | Env | Caller (worker) |
|---|---|---|
| Firecrawl (Crunchbase-like scrape) | `FIRECRAWL_API_KEY` (+ optional CSV `FIRECRAWL_API_KEYS`) | [apps/trendingrepo-worker/src/fetchers/funding-news/](../../apps/trendingrepo-worker/src/fetchers/funding-news/) |
| Coingecko | none (rate-limited public) | [fetchers/x-funding/](../../apps/trendingrepo-worker/src/fetchers/) + [scripts/fetch-coingecko-agents.mjs](../../scripts/fetch-coingecko-agents.mjs) |
| Dune Analytics | `DUNE_API_KEY` | [scripts/fetch-dune-x402.mjs](../../scripts/fetch-dune-x402.mjs) |
| Libraries.io | `LIBRARIES_IO_API_KEY` | worker-side OSS funding signals |
| Solana RPC | `SOLANA_RPC_URL` | [scripts/fetch-solana-x402-onchain.mjs](../../scripts/fetch-solana-x402-onchain.mjs) |
| Base x402 onchain | none (RPC-driven) | [scripts/fetch-base-x402-onchain.mjs](../../scripts/fetch-base-x402-onchain.mjs) |
| Crunchbase via TechCrunch / VentureBeat / Sifted | scraped via Firecrawl | [scripts/scrape-funding-news.mjs](../../scripts/scrape-funding-news.mjs) |

- **Cron**: `collect-funding.yml` every 6h `0 */6 * * *`.
- **Outputs**: `data/funding-news.json`, `data/funding-aliases.json`, `data/funding-seeds.json`.

---

## 14. MCP-related

- **Smithery**: `SMITHERY_API_KEY`, host `www.smithery.ai/api/...`. Callers: [scripts/fetch-mcp-registries.mjs](../../scripts/fetch-mcp-registries.mjs), worker fetchers `mcp-smithery-rank/`, `smithery/`. Cron: `refresh-mcp-smithery-rank.yml` `11 */6 * * *`, `refresh-skill-smithery.yml` `30 */6 * * *`, `refresh-skill-skillsmp.yml` `5 */6 * * *`.
- **PulseMCP**: `PULSEMCP_API_KEY`, `PULSEMCP_TENANT_ID`. Worker fetcher `pulsemcp/`. Cron: `ping-mcp-liveness.yml` `47 */6 * * *`, `refresh-mcp-dependents.yml` daily `53 4 * * *`.
- **Glama**: `GLAMA_API_KEY`. Worker fetcher `glama/`. No dedicated workflow — pulled inside MCP refresh sweeps.
- **mcp.so**: scraped via Firecrawl. Worker fetcher `mcp-so/`.
- **MCP Registry Official**: worker fetcher `mcp-registry-official/`.

---

## 15. AI / LLM endpoints

- **Kimi For Coding**: `KIMI_API_KEY`, `KIMI_BASE_URL` (default `api.kimi.com/coding/v1`), `KIMI_MODEL`. Caller: [apps/trendingrepo-worker/src/fetchers/consensus-analyst/llm.ts](../../apps/trendingrepo-worker/src/fetchers/consensus-analyst/llm.ts). **CRITICAL**: requires `stream: true` (non-stream hangs silently); UA allowlist enforced (`claude-cli`, `RooCode`, `Kilo-Code`). See CLAUDE.md anti-patterns.
- **OpenRouter**: caller [scripts/fetch-openrouter-models.mjs](../../scripts/fetch-openrouter-models.mjs). Used to drive model-usage charts. Env not in main app schema.
- **Artificial Analysis**: `AA_API_KEY`. Caller [scripts/fetch-artificial-analysis.mjs](../../scripts/fetch-artificial-analysis.mjs). Used by `cron-agent-commerce.yml`.
- **Claude RSS / OpenAI RSS**: scraped, no auth. [scripts/scrape-claude-rss.mjs](../../scripts/scrape-claude-rss.mjs) `22 7 * * *`, [scripts/scrape-openai-rss.mjs](../../scripts/scrape-openai-rss.mjs) `47 7 * * *`. Outputs `data/claude-rss.json`, `data/openai-rss.json`.

---

## 16. Trustmrr (revenue overlay)

- **Auth**: `TRUSTMRR_API_KEY`
- **Caller**: [scripts/sync-trustmrr.mjs](../../scripts/sync-trustmrr.mjs), [scripts/_trustmrr.mjs](../../scripts/_trustmrr.mjs)
- **Cron**: `sync-trustmrr.yml` daily `27 2 * * *` (full sync) + hourly delta sync (24 cron entries one per UTC hour).
- **Outputs**: `data/trustmrr-startups.json`, `data/revenue-overlays.json`.
- **Modes**: `--mode=full` vs `--mode=delta` (selected by workflow based on event).

---

## 17. Anthropic API (sentry-fix-bot only)

- **Auth**: `ANTHROPIC_API_KEY`
- **Caller**: GitHub Action `sentry-fix-bot.yml` (workflow_dispatch only).
- **Use**: triage Sentry issues, propose fix PRs.

---

## 18. Resend (transactional email)

- **Auth**: `RESEND_API_KEY` (npm dep `resend@6.12.0` in package.json).
- **Caller**: digest emails — [src/lib/email/](../../src/lib/email/), driven by `cron-digest-weekly.yml` Mondays 08:00 UTC.

---

## 19. Stripe (configured, not active)

- **Auth**: Stripe SDK env (`STRIPE_SECRET_KEY` etc., not currently billing).
- **Caller**: [scripts/seed-stripe-products.mjs](../../scripts/seed-stripe-products.mjs) — seed-only. Not in production billing path.
- **Per CLAUDE.md**: "configured but not billed yet".

---

## 20. PostHog (analytics ping only)

- **Auth**: PostHog API key (npm deps `posthog-js@1.372.3`, `posthog-node@4.18.0`).
- **Caller**: `uptime-monitor.yml` posts events. No first-party SDK lib in `src/lib/` yet (analytics gap, ENGINE.md §6 Tier 5).

---

## 21. Sentry

- **Auth**: `SENTRY_DSN` || `NEXT_PUBLIC_SENTRY_DSN`.
- **Config files**: [sentry.server.config.ts](../../sentry.server.config.ts), [sentry.edge.config.ts](../../sentry.edge.config.ts) (and a `sentry.client.config.ts` if present in deploy bundle).
- **Org/project**: `agnt-pf` org, EU `de.sentry.io`, project id `4511285393686608` (per memory note).
- **Sample rates**: `tracesSampleRate: 0.1` in production, 0 dev. `profilesSampleRate: 0`.
- **Network-transient deduplication**: `beforeSend` fingerprints `ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed` together so one network blip doesn't fan out into N issues.
- **Tags**: `runtime: nodejs`, `product: trendingrepo`.
- **GitHub-pool integration**: pool exhaustion / quarantine / low-quota fire dedicated tags on the same DSN — see Section 1.
- **Note**: instrumentation hook ([instrumentation.ts](../../instrumentation.ts)) is intentionally a no-op due to a Turbopack 15.5 + Sentry 10.50 dev-server bug; production builds use webpack and aren't affected.

---

## 22. Redis (storage backend, not external API per se)

- **Auth pair (pick exactly one)**:
  - `REDIS_URL` (Railway native, ioredis TCP) — preferred path
  - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (legacy fallback)
- **Backend selection**: [src/lib/data-store.ts:504](../../src/lib/data-store.ts) — picks based on URL scheme (`redis://` / `rediss://` → ioredis, `https://` → Upstash REST).
- **ioredis tuning**: `maxRetriesPerRequest: 3`, `connectTimeout: 5_000`, `commandTimeout: 30_000`, `enableOfflineQueue: true`.
- **Refinement guard**: [apps/trendingrepo-worker/src/lib/env.ts:68](../../apps/trendingrepo-worker/src/lib/env.ts) refuses both being set.

---

## 23. Supabase (worker-only)

- **Auth**: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE`
- **Caller**: [apps/trendingrepo-worker/src/lib/db.ts](../../apps/trendingrepo-worker/src/lib/db.ts) — `createClient()` with service-role bypass.
- **Schema**: see [03-STORAGE-AND-FRESHNESS.md §Supabase](03-STORAGE-AND-FRESHNESS.md).
- **Driven by**: `pg_cron` nightly 03:00 UTC (in-database scheduler, not GitHub Actions).
- **Main app does NOT touch Supabase** — verified via grep, no `@supabase/supabase-js` import outside `apps/trendingrepo-worker/`.

---

## Internal API surface (own routes)

The main app exposes its own API at `src/app/api/`. Notable for the engine:
- `/api/cron/aiso-drain`, `/api/cron/digest`, `/api/cron/llm/{aggregate,sync-models}`, `/api/cron/mcp/rotate-usage`, `/api/cron/news-auto-recover`, `/api/cron/predictions`, `/api/cron/twitter-daily`, `/api/cron/twitter-weekly-recap`, `/api/cron/webhooks/{flush,scan}` — all `CRON_SECRET`-bearer-authed, called from GHA via `curl`.
- `/api/pipeline/ingest`, `/api/pipeline/recompute`, `/api/pipeline/deltas` — pipeline mutators / readers.
- `/api/repos/[owner]/[name]?v=2`, `/api/repos/[owner]/[name]/star-activity` — public read.
- `/admin/*` — cookie-auth admin surface (pool, pool-aggregate, staleness, scoring-shadow).

---

## Total unique env vars referenced for auth

```
APIFY_API_TOKEN, APIFY_PROXY_GROUPS, APIFY_PROXY_COUNTRY, APIFY_TWITTER_ACTOR,
ANTHROPIC_API_KEY, AA_API_KEY, AGENT_COMMERCE_WEBHOOK_URL,
BLUESKY_HANDLE, BLUESKY_APP_PASSWORD,
CRON_SECRET,
DEVTO_API_KEY, DEVTO_API_KEYS, DUNE_API_KEY,
FIRECRAWL_API_KEY, FIRECRAWL_API_KEYS,
GH_PAT_DEFAULT, GITHUB_TOKEN, GH_TOKEN_POOL, GITHUB_TOKEN_POOL,
GLAMA_API_KEY, HF_TOKEN, INTERNAL_AGENT_TOKEN,
KIMI_API_KEY, KIMI_BASE_URL, KIMI_MODEL,
LIBRARIES_IO_API_KEY,
NPM_DOWNLOAD_LAG_DAYS, NPM_SEARCH_SIZE, NPM_CANDIDATE_LIMIT,
OPS_ALERT_WEBHOOK,
PRODUCTHUNT_TOKEN, PRODUCTHUNT_TOKENS,
PULSEMCP_API_KEY, PULSEMCP_TENANT_ID,
REDIS_URL, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT,
RESEND_API_KEY,
SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN,
SMITHERY_API_KEY,
SOLANA_RPC_URL,
STRIPE_SECRET_KEY (configured, not billing),
SUPABASE_URL, SUPABASE_SERVICE_ROLE (worker-only),
TRUSTMRR_API_KEY,
TWITTER_WEB_ACCOUNTS_JSON
```
