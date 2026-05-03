# 02 — Every Workflow (62 GHA + 9 Vercel cron routes)

Two cron lanes:
- **GHA-direct** — runs a script on a GitHub Actions runner. Writes `data/*.json` (or `.data/*.jsonl`), commits to `main`, Vercel auto-redeploys. Also dual-writes to Redis when `REDIS_URL` / `UPSTASH_*` is set.
- **HTTP-poll** — GHA `curl`s `https://trendingrepo.com/api/cron/<route>` with `Authorization: Bearer $CRON_SECRET`. Vercel route mutates Redis directly.

---

## Per-5-min (1 workflow → 12,960 fires/day)

| Workflow | Cron | Lane | Trigger | Output |
|---|---|---|---|---|
| [uptime-monitor.yml](../../.github/workflows/uptime-monitor.yml) | `*/5 * * * *` | HTTP-poll | PostHog ping (uptime probe) | uptime metrics |

---

## Per-15-min (1 workflow)

| Workflow | Cron | Lane | Trigger | Output |
|---|---|---|---|---|
| [cron-freshness-check.yml](../../.github/workflows/cron-freshness-check.yml) | `*/15 * * * *` | HTTP-poll | check + alert via `OPS_ALERT_WEBHOOK` | Discord/Slack pings if anything stale |

---

## Per-30-min (3 workflows)

| Workflow | Cron | Lane | Script / Route |
|---|---|---|---|
| [cron-aiso-drain.yml](../../.github/workflows/cron-aiso-drain.yml) | `0,30 * * * *` | HTTP-poll | `POST /api/cron/aiso-drain` |
| [cron-webhooks-flush.yml](../../.github/workflows/cron-webhooks-flush.yml) | `5,35 * * * *` | HTTP-poll | `POST /api/cron/webhooks/flush` + `/scan` |
| [health-watch.yml](../../.github/workflows/health-watch.yml) | `*/30 * * * *` | GHA-direct | `node scripts/check-source-health.mjs` → breaker state |

---

## Hourly / per-2h (8 workflows, staggered minute offsets)

| Workflow | Cron | Lane | Script | Output |
|---|---|---|---|---|
| [audit-freshness.yml](../../.github/workflows/audit-freshness.yml) | `0 * * * *` | GHA-direct | `node scripts/audit-freshness.mjs` | gate fail if any source past budget |
| [cron-llm.yml](../../.github/workflows/cron-llm.yml) | `10 * * * *` + `15 2 * * *` | HTTP-poll | `GET /api/cron/llm/aggregate` (hourly) + `/sync-models` (daily 02:15) | LLM telemetry |
| [cron-pipeline-ingest.yml](../../.github/workflows/cron-pipeline-ingest.yml) | `15 */2 * * *` | HTTP-poll | `POST /api/cron/pipeline-ingest` | mention store hydrate |
| [scrape-bluesky.yml](../../.github/workflows/scrape-bluesky.yml) | `17 * * * *` | GHA-direct | `node scripts/scrape-bluesky.mjs` | bluesky-{mentions,trending}.json |
| [scrape-trending.yml](../../.github/workflows/scrape-trending.yml) | `27 * * * *` | GHA-direct | `node scripts/scrape-trending.mjs --skip-collection-rankings` | trending.json + cross-signal snapshots |
| [scrape-lobsters.yml](../../.github/workflows/scrape-lobsters.yml) | `37 * * * *` | GHA-direct | `node scripts/scrape-lobsters.mjs` | lobsters-*.json |
| [enrich-repo-profiles.yml](../../.github/workflows/enrich-repo-profiles.yml) | `41 * * * *` | GHA-direct | `node scripts/enrich-repo-profiles.mjs --mode incremental --limit 50 --max-scans 5` | repo-profiles.json |
| [refresh-fast-discovery (`refresh-hotness-snapshot.yml`)] | `27 * * * *` | GHA-direct | `node scripts/discover-recent-repos.mjs` + `npx tsx src/index.ts hotness-snapshot` | recent-repos.json |

---

## Per-3h (1 workflow)

| Workflow | Cron | Lane | Script | Output |
|---|---|---|---|---|
| [collect-twitter.yml](../../.github/workflows/collect-twitter.yml) | `0 */3 * * *` | GHA-direct (writes `.data/`) | `npm run collect:twitter` (runs `tsx scripts/collect-twitter-signals.ts`) | `.data/twitter-*.jsonl`, `data/_meta/twitter.json` |

---

## Per-6h (12 workflows; staggered minute offsets to avoid thundering-herd)

| Workflow | Cron | Lane | Script |
|---|---|---|---|
| [collect-funding.yml](../../.github/workflows/collect-funding.yml) | `0 */6 * * *` | GHA-direct | `npm run scrape:funding -- --enrich` |
| [refresh-skill-skillsmp.yml](../../.github/workflows/refresh-skill-skillsmp.yml) | `5 */6 * * *` | GHA-direct | `npx tsx src/index.ts skillsmp` |
| [refresh-mcp-smithery-rank.yml](../../.github/workflows/refresh-mcp-smithery-rank.yml) | `11 */6 * * *` | GHA-direct | `npx tsx src/index.ts mcp-smithery-rank` |
| [scrape-huggingface.yml](../../.github/workflows/scrape-huggingface.yml) | `13 */6 * * *` | GHA-direct | `node scripts/scrape-huggingface.mjs` |
| [refresh-collection-rankings.yml](../../.github/workflows/refresh-collection-rankings.yml) | `17 */6 * * *` | GHA-direct | `node scripts/scrape-trending.mjs --only-collection-rankings` |
| [refresh-npm-downloads.yml](../../.github/workflows/refresh-npm-downloads.yml) | `23 */6 * * *` | GHA-direct | `npx tsx src/index.ts npm-downloads` |
| [scrape-huggingface-datasets.yml](../../.github/workflows/scrape-huggingface-datasets.yml) | `25 */6 * * *` | GHA-direct | `node scripts/scrape-huggingface-datasets.mjs` |
| [refresh-skill-smithery.yml](../../.github/workflows/refresh-skill-smithery.yml) | `30 */6 * * *` | GHA-direct | `npx tsx src/index.ts smithery-skills` |
| [refresh-mcp-usage-snapshot.yml](../../.github/workflows/refresh-mcp-usage-snapshot.yml) | `30 3 * * *` daily | GHA-direct | `npx tsx src/index.ts mcp-usage-snapshot` |
| [scrape-huggingface-spaces.yml](../../.github/workflows/scrape-huggingface-spaces.yml) | `35 */6 * * *` | GHA-direct | `node scripts/scrape-huggingface-spaces.mjs` |
| [refresh-pypi-downloads.yml](../../.github/workflows/refresh-pypi-downloads.yml) | `37 */6 * * *` | GHA-direct | `npx tsx src/index.ts pypi-downloads` |
| [scrape-devto.yml](../../.github/workflows/scrape-devto.yml) | `0 */6 * * *` | GHA-direct | `node scripts/scrape-devto.mjs` |
| [ping-mcp-liveness.yml](../../.github/workflows/ping-mcp-liveness.yml) | `47 */6 * * *` | GHA-direct | `node scripts/ping-mcp-liveness.mjs` |

---

## Per-12h (2 workflows)

| Workflow | Cron | Lane | Script |
|---|---|---|---|
| [refresh-skill-derivatives.yml](../../.github/workflows/refresh-skill-derivatives.yml) | `7 */12 * * *` | GHA-direct | `npx tsx src/index.ts skill-derivatives` |
| [refresh-skill-lobehub.yml](../../.github/workflows/refresh-skill-lobehub.yml) | `45 */12 * * *` | GHA-direct | `npx tsx src/index.ts lobehub-skills` |
| [enrich-arxiv.yml](../../.github/workflows/enrich-arxiv.yml) | `13 */12 * * *` | GHA-direct | `node scripts/enrich-arxiv.mjs` |

---

## Daily (22+ workflows)

| Workflow | Cron (UTC) | Lane | Script |
|---|---|---|---|
| [run-shadow-scoring.yml](../../.github/workflows/run-shadow-scoring.yml) | `0 2 * * *` | GHA-direct | `node scripts/run-shadow-scoring.mjs` |
| [sweep-staleness.yml](../../.github/workflows/sweep-staleness.yml) | `0 2 * * *` | GHA-direct | `node scripts/sweep-staleness.mjs` |
| [refresh-skill-install-snapshot.yml](../../.github/workflows/refresh-skill-install-snapshot.yml) | `0 3 * * *` | GHA-direct | `npx tsx src/index.ts skill-install-snapshot` |
| [refresh-mcp-usage-snapshot.yml](../../.github/workflows/refresh-mcp-usage-snapshot.yml) | `30 3 * * *` | GHA-direct | `npx tsx src/index.ts mcp-usage-snapshot` |
| [refresh-skill-claude.yml](../../.github/workflows/refresh-skill-claude.yml) | `12 3 * * *` | GHA-direct | `npx tsx src/index.ts claude-skills` |
| [refresh-skill-forks-snapshot.yml](../../.github/workflows/refresh-skill-forks-snapshot.yml) | `13 3 * * *` | GHA-direct | `npx tsx src/index.ts skill-forks-snapshot` |
| [aiso-self-scan.yml](../../.github/workflows/aiso-self-scan.yml) | `17 3 * * *` | GHA-direct | `npx tsx scripts/submit-agent-commerce-aiso.ts` |
| [refresh-star-activity.yml](../../.github/workflows/refresh-star-activity.yml) | `17 3 * * *` | GHA-direct | `node scripts/append-star-activity.mjs` |
| [refresh-hotness-snapshot.yml](../../.github/workflows/refresh-hotness-snapshot.yml) | `25 3 * * *` | GHA-direct | `npx tsx src/index.ts hotness-snapshot` |
| [cron-pipeline-cleanup.yml](../../.github/workflows/cron-pipeline-cleanup.yml) | `0 4 * * *` | HTTP-poll | `POST /api/cron/pipeline-cleanup` |
| [scrape-awesome-skills.yml](../../.github/workflows/scrape-awesome-skills.yml) | `23 4 * * *` | GHA-direct | `node scripts/scrape-awesome-skills.mjs` |
| [promote-unknown-mentions.yml](../../.github/workflows/promote-unknown-mentions.yml) | `30 4 * * *` | GHA-direct | `node scripts/promote-unknown-mentions.mjs` |
| [cron-agent-commerce.yml](../../.github/workflows/cron-agent-commerce.yml) | `31 4 * * *` | GHA-direct (multi-step) | `build-agent-commerce-seed`, `discover-agent-commerce`, `fetch-agent-commerce-{live,social}`, `fetch-{agentic-market,artificial-analysis,base-x402-onchain,coingecko-agents,openrouter-models,solana-x402-onchain}`, `fetch-dune-x402` |
| [refresh-mcp-dependents.yml](../../.github/workflows/refresh-mcp-dependents.yml) | `53 4 * * *` | GHA-direct | `npx tsx src/index.ts npm-dependents` |
| [cron-predictions.yml](../../.github/workflows/cron-predictions.yml) | `0 6 * * *` | HTTP-poll | `POST /api/cron/predictions` |
| [scrape-claude-rss.yml](../../.github/workflows/scrape-claude-rss.yml) | `22 7 * * *` | GHA-direct | `node scripts/scrape-claude-rss.mjs` |
| [scrape-openai-rss.yml](../../.github/workflows/scrape-openai-rss.yml) | `47 7 * * *` | GHA-direct | `node scripts/scrape-openai-rss.mjs` |
| [scrape-npm.yml](../../.github/workflows/scrape-npm.yml) | `17 9 * * *` | GHA-direct | `node scripts/scrape-npm.mjs` |
| [scrape-producthunt.yml](../../.github/workflows/scrape-producthunt.yml) | `0 11,15,19,23 * * *` (4×/day) | GHA-direct | `node scripts/scrape-producthunt.mjs` |
| [cron-twitter-outbound.yml](../../.github/workflows/cron-twitter-outbound.yml) | `0 14 * * *` + `0 16 * * 5` | HTTP-poll | `POST /api/cron/twitter-daily` (Mon-Thu/Sat-Sun) + `POST /api/cron/twitter-weekly-recap` (Fri) |
| [snapshot-top10-sparklines.yml](../../.github/workflows/snapshot-top10-sparklines.yml) | `50 23 * * *` | GHA-direct | `npm run snapshot:top10-sparklines` |
| [snapshot-top10.yml](../../.github/workflows/snapshot-top10.yml) | `55 23 * * *` | GHA-direct | `npm run snapshot:top10` |
| [snapshot-consensus.yml](../../.github/workflows/snapshot-consensus.yml) | `55 23 * * *` | GHA-direct | `npm run snapshot:consensus` |
| [sync-trustmrr.yml](../../.github/workflows/sync-trustmrr.yml) | `27 2 * * *` (full) + `27 0,1,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23 * * *` (delta hourly) | GHA-direct | `node scripts/sync-trustmrr.mjs --mode=full \| --mode=delta` |

---

## Weekly (2 workflows)

| Workflow | Cron | Lane | Script |
|---|---|---|---|
| [cron-pipeline-rebuild.yml](../../.github/workflows/cron-pipeline-rebuild.yml) | `0 5 * * 0` (Sun) | HTTP-poll | full mention store rebuild — destructive op |
| [cron-digest-weekly.yml](../../.github/workflows/cron-digest-weekly.yml) | `0 8 * * 1` (Mon) | HTTP-poll | `POST /api/cron/digest/weekly` (Resend email send) |
| [refresh-reddit-baselines.yml](../../.github/workflows/refresh-reddit-baselines.yml) | `17 3 * * 1` (Mon) | GHA-direct | `node scripts/compute-reddit-baselines.mjs` |

---

## Monthly (1 workflow)

| Workflow | Cron | Lane | Script |
|---|---|---|---|
| [cron-mcp-usage-rotate.yml](../../.github/workflows/cron-mcp-usage-rotate.yml) | `0 3 1 * *` (1st of month, 03:00 UTC) | HTTP-poll | `POST /api/cron/mcp/rotate-usage` |

---

## Manual / on-push (4 workflows)

| Workflow | Trigger | Notes |
|---|---|---|
| [ci.yml](../../.github/workflows/ci.yml) | `push`, `pull_request` | typecheck + lint:guards + tests + e2e + build |
| [probe-reddit.yml](../../.github/workflows/probe-reddit.yml) | `workflow_dispatch` | diagnostic — dumps Reddit endpoint health |
| [sentry-fix-bot.yml](../../.github/workflows/sentry-fix-bot.yml) | `workflow_dispatch` | listens for Sentry issues, proposes fix PR via Anthropic API |
| [trendingrepo-worker.yml](../../.github/workflows/trendingrepo-worker.yml) | `workflow_dispatch` | typecheck-only for the worker subdirectory |
| [scrape-arxiv.yml](../../.github/workflows/scrape-arxiv.yml) | `43 */3 * * *` | (already listed above under per-3h) |
| [cron-pipeline-persist.yml](../../.github/workflows/cron-pipeline-persist.yml) | `30 */6 * * *` | `POST /api/cron/pipeline-persist` |

---

## 9 Vercel cron HTTP routes (target of HTTP-poll lane)

Located under `src/app/api/cron/`. All require `Authorization: Bearer $CRON_SECRET`.

| Route | Caller workflow | Cron |
|---|---|---|
| `/api/cron/aiso-drain` | cron-aiso-drain.yml | every 30 min :00/:30 |
| `/api/cron/digest/weekly` | cron-digest-weekly.yml | Mon 08:00 |
| `/api/cron/llm/aggregate` + `/llm/sync-models` | cron-llm.yml | hourly :10 + daily 02:15 |
| `/api/cron/mcp/rotate-usage` | cron-mcp-usage-rotate.yml | monthly 1st 03:00 |
| `/api/cron/news-auto-recover` | (called from `cron-llm.yml` aggregate path) | hourly |
| `/api/cron/predictions` | cron-predictions.yml | daily 06:00 |
| `/api/cron/twitter-daily` | cron-twitter-outbound.yml | daily 14:00 (Mon-Thu/Sat-Sun) |
| `/api/cron/twitter-weekly-recap` | cron-twitter-outbound.yml | Fri 16:00 |
| `/api/cron/webhooks/flush` + `/webhooks/scan` | cron-webhooks-flush.yml | every 30 min :05/:35 |

---

## Daily fire count (matches ENGINE.md)

- Per-5-min: 12,960/day
- Per-15-min: 96/day
- Per-30-min (3 workflows): 144/day
- Hourly group (8 workflows): 192/day
- Per-3h (1): 8/day
- Per-6h (12): 48/day
- Per-12h (3): 6/day
- Daily (~25): 25/day
- Weekly (3): 0.43/day
- Monthly (1): 0.033/day

**~13,479 cron fires per day**, of which **12,960 are uptime-monitor** alone. Workload-relevant fires: ~519/day.

---

## Top 5 highest-frequency

1. `uptime-monitor.yml` — every 5 min
2. `cron-freshness-check.yml` — every 15 min
3. `cron-aiso-drain.yml` + `cron-webhooks-flush.yml` + `health-watch.yml` — every 30 min (tied)
4. Hourly group — 8 workflows
5. `audit-freshness.yml` — hourly :00

---

## All unique secrets referenced

`AA_API_KEY`, `AGENT_COMMERCE_WEBHOOK_URL`, `ANTHROPIC_API_KEY` (sentry-fix-bot only), `APIFY_API_TOKEN`, `BLUESKY_APP_PASSWORD`, `BLUESKY_HANDLE`, `CRON_SECRET`, `DEVTO_API_KEY`, `DEVTO_API_KEYS`, `GH_PAT_DEFAULT`, `GH_TOKEN_POOL`, `GITHUB_TOKEN`, `GITHUB_TOKEN_POOL`, `INTERNAL_AGENT_TOKEN`, `LIBRARIES_IO_API_KEY`, `OPS_ALERT_WEBHOOK`, `PRODUCTHUNT_TOKEN`, `PRODUCTHUNT_TOKENS`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`, `REDIS_URL`, `SMITHERY_API_KEY`, `SOLANA_RPC_URL`, `TRUSTMRR_API_KEY`, `TWITTER_WEB_ACCOUNTS_JSON`, `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_REDIS_REST_URL`. Plus runtime-only (read in route handlers, not workflow YAMLs): `SENTRY_DSN`, `KIMI_API_KEY`, `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, `STRIPE_SECRET_KEY`, `HF_TOKEN`, `FIRECRAWL_API_KEY`.
