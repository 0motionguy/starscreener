---
last-verified: 2026-05-05
verified-by: claude
status: living
---

# ENGINE - STARSCREENER workflow + cron + key inventory

Last derived from filesystem on 2026-05-05. Direct re-derivation:

- Workflows: `Glob .github/workflows/*.yml` (count = 90)
- Cron API routes: `Glob src/app/api/cron/**/route.ts` (count = 14)
- Worker fetchers: `apps/trendingrepo-worker/src/registry.ts` (44 active in `FETCHERS[]`, all imported and exported; 4 prior stub directories — `huggingface`, `github`, `mcp-so`, `mcp-servers-repo` — deleted 2026-05-05. 3 implementations exist on disk but are not yet wired: `ai-blogs`, `arxiv`, `github-events`. `agent-commerce/` is data-only.)
- Env vars: `.env.example` + `src/lib/env.ts` + `process.env.*` greps in `scripts/` and `apps/trendingrepo-worker/src/`

This file is the canonical engine map. Every gain/loss of a workflow,
cron route, fetcher, or external service must update it in the same
commit.

---

## 1. GH Actions (.github/workflows/*.yml) - 87 files

Source: `Grep -E "^name:|cron:" .github/workflows/<file>.yml`. Only
`schedule.cron` triggers + the workflow's primary `run:` line are shown.
Workflows with multiple cron entries list each.

| File | Name | Trigger | What it does |
|---|---|---|---|
| aiso-self-scan.yml | AISO monthly regression watcher | `17 3 1 * *` (monthly day 1 03:17 UTC) | `node scripts/aiso-monthly-regression-watcher.mjs` - scans trendingrepo.com via aiso.tools, files child issue if dimension drops > threshold |
| audit-freshness.yml | Audit - source freshness | `8 * * * *` (hourly :08) | `node scripts/audit-freshness.mjs` - reads every `data/_meta/*.json`, fails if any source past freshness budget |
| backfill-meta.yml | Backfill orphan meta keys | `workflow_dispatch` only | `node scripts/backfill-meta.mjs` |
| check-nitter.yml | nitter-health-check | `0 4 * * *` | `node scripts/check-nitter-health.mjs` |
| check-profile-completion.yml | Profile completion check | `*/30 * * * *` | `tsx scripts/check-profile-completion.ts --mode top` - audits top-100 repo profiles, writes `data/profile-completion-queue.json` consumed by `enrich-repo-profiles.yml` and `sweep-cross-source-mentions.yml` |
| ci.yml | CI | `push`, `pull_request`, `workflow_dispatch` | `npm run typecheck`, `lint:guards`, `check-v3-token-budget`, `test:hooks` |
| cleanup-stale-previews.yml | Cleanup Stale Vercel Previews | `23 2 * * 1` (Mon 02:23) | Deletes stale Vercel preview deployments via Vercel API |
| collect-funding.yml | Collect Funding Signals | `0 */6 * * *` | `npm run scrape:funding` (techcrunch, venturebeat, sifted) + `scrape:funding:crunchbase` |
| collect-twitter.yml | Collect Twitter Signals | `0 */3 * * *` | `npm run collect:twitter` (Apify `apidojo~tweet-scraper`) |
| conventional-commits.yml | Conventional Commits | `pull_request`, `workflow_dispatch` | Lints PR titles |
| cron-agent-commerce.yml | Refresh agent-commerce pipeline | `31 4 * * *` | `fetch-agentic-market.mjs` + `fetch-openrouter-models.mjs` + `fetch-coingecko-agents.mjs` + `fetch-artificial-analysis.mjs` + `fetch-base-x402-onchain.mjs` |
| cron-aiso-drain.yml | Cron - AISO drain | `3,33 * * * *` | POST `/api/cron/aiso-drain` |
| cron-digest-weekly.yml | Cron - weekly digest email | `0 14 * * 5` (Fri 14:00) | POST `/api/cron/digest/weekly` |
| cron-freshness-check.yml | Cron - freshness check | `*/15 * * * *` | GET `/api/cron/freshness/state` |
| cron-github-pool-budget.yml | Cron - github pool budget | `*/5 * * * *` | POST `/api/cron/github-pool-budget` |
| cron-llm.yml | Cron - LLM telemetry | `10 * * * *` and `15 2 * * *` | GET `/api/cron/llm/aggregate` (hourly) + `/api/cron/llm/sync-models` (daily) |
| cron-mcp-usage-rotate.yml | Cron - MCP usage log rotation | `0 3 1 * *` (monthly 1st 03:00) | POST `/api/cron/mcp/rotate-usage` |
| cron-pipeline-cleanup.yml | Cron - pipeline cleanup | `12 4 * * *` | mention pruning (hits cron route) |
| cron-pipeline-ingest.yml | Cron - pipeline ingest | `15 */2 * * *` | mention store hydrate |
| cron-pipeline-persist.yml | Cron - pipeline persist | `30 */6 * * *` | mention store persist |
| cron-pipeline-rebuild.yml | Cron - pipeline rebuild | `0 5 * * 0` (Sun 05:00) | weekly mention store rebuild |
| cron-predictions.yml | Cron - predictions | `0 6 * * *` | POST `/api/cron/predictions` |
| cron-subdomain-takeover.yml | Cron - subdomain takeover scan | `0 3 * * 1` (Mon 03:00) | POST `/api/cron/subdomain-takeover` |
| cron-twitter-outbound.yml | Cron - Twitter outbound | `0 14 * * *` and `0 16 * * 5` | POST `/api/cron/twitter-daily` (daily) or `/api/cron/twitter-weekly-recap` (Fri) |
| cron-warmup.yml | Warm Vercel routes | `*/5 8-21 * * *` | curl warm pings to hot routes |
| cron-webhooks-flush.yml | Cron - webhooks flush + scan | `5,35 * * * *` | POST `/api/cron/webhooks/scan` then `/api/cron/webhooks/flush` |
| docs-freshness.yml | docs-freshness | `0 13 * * 1` (Mon 13:00) + PR | `node scripts/check-docs-freshness.mjs` |
| enrich-arxiv.yml | Enrich arXiv signals | `13 */12 * * *` | `node scripts/enrich-arxiv.mjs` |
| enrich-repo-profiles.yml | Refresh repo profiles | `41 * * * *` | `node scripts/enrich-repo-profiles.mjs --mode incremental --limit 50` |
| health-watch.yml | Source health watch | `*/30 * * * *` | `node scripts/check-source-health.mjs` |
| pa11y-ci.yml | pa11y-ci | `pull_request`, `workflow_dispatch` | `pa11y-ci` accessibility lint |
| ping-mcp-liveness.yml | Ping MCP liveness | `47 */6 * * *` | `node scripts/ping-mcp-liveness.mjs` |
| post-deploy-smoke.yml | Post-deploy smoke | `push`, `workflow_dispatch` | curl smoke tests against `/api/cron/freshness/state` |
| probe-reddit.yml | Probe Reddit endpoints (diagnostic) | `workflow_dispatch` only | `node scripts/probe-reddit-endpoints.mjs` |
| promote-unknown-mentions.yml | Promote unknown mentions | `30 4 * * *` | `node scripts/promote-unknown-mentions.mjs` |
| refresh-collection-rankings.yml | Refresh collection rankings | `17 */6 * * *` | `node scripts/scrape-trending.mjs --only-collection-rankings` |
| refresh-hotness-snapshot.yml | Refresh hotness snapshot | `25 3 * * *` | hotness snapshot |
| refresh-mcp-dependents.yml | Refresh MCP dependents | `53 4 * * *` | mcp-dependents snapshot |
| refresh-mcp-smithery-rank.yml | Refresh MCP Smithery rank | `11 3 * * *` | smithery rank snapshot |
| refresh-mcp-usage-snapshot.yml | Refresh MCP usage snapshot | `30 3 * * *` | mcp usage snapshot |
| refresh-npm-downloads.yml | Refresh npm downloads | `23 */6 * * *` | npm dl snapshot |
| refresh-pypi-downloads.yml | Refresh pypi downloads | `37 */6 * * *` | pypi dl snapshot |
| refresh-reddit-baselines.yml | Refresh Reddit baselines | `17 3 * * 1` (Mon) | `node scripts/compute-reddit-baselines.mjs` + `scrape-reddit.mjs` |
| refresh-skill-claude.yml | Refresh skill claude | `12 3 * * *` | anthropic + community SKILL.md index |
| refresh-skill-derivatives.yml | Refresh skill derivative counts | `7 */12 * * *` | derivative count |
| refresh-skill-forks-snapshot.yml | Refresh skill forks snapshot | `13 3 * * *` | forks snapshot |
| refresh-skill-install-snapshot.yml | Refresh skill install snapshot | `0 3 * * *` | install snapshot |
| refresh-skill-lobehub.yml | Refresh skill lobehub | `45 */12 * * *` | lobehub skills |
| refresh-skill-skillsmp.yml | Refresh skill skillsmp | `5 3 * * *` | skillsmp 1M+ catalog |
| refresh-skill-smithery.yml | Refresh skill smithery | `30 3 * * *` | smithery skills index |
| refresh-star-activity.yml | Refresh star activity | `17 3 * * *` | `node scripts/append-star-activity.mjs` |
| release-cdn-purge-and-targeted-refresh.yml | Release - CDN Purge + Targeted Refresh | `workflow_dispatch` only | post-deploy CDN purge + targeted re-warm |
| run-shadow-scoring.yml | Run shadow scoring | `0 2 * * *` | `node scripts/run-shadow-scoring.mjs` |
| scrape-arxiv.yml | Refresh arXiv signals | `43 */3 * * *` | `node scripts/scrape-arxiv.mjs` |
| scrape-awesome-skills.yml | Refresh awesome-skills index | `23 4 * * *` | `node scripts/scrape-awesome-skills.mjs` |
| scrape-bluesky.yml | Refresh Bluesky signals | `17 * * * *` | `node scripts/scrape-bluesky.mjs` |
| scrape-claude-rss.yml | Refresh Claude (Anthropic) news | `22 7 * * *` | `node scripts/scrape-claude-rss.mjs` |
| scrape-devto.yml | Refresh dev.to signals | `18 */6 * * *` | `node scripts/scrape-devto.mjs` |
| scrape-huggingface.yml | Refresh HuggingFace signals | `13 */6 * * *` | `node scripts/scrape-huggingface.mjs` |
| scrape-huggingface-datasets.yml | Refresh HuggingFace dataset signals | `25 */6 * * *` | datasets variant |
| scrape-huggingface-spaces.yml | Refresh HuggingFace space signals | `35 */6 * * *` | spaces variant |
| scrape-lobsters.yml | Refresh Lobsters signals | `37 * * * *` | `node scripts/scrape-lobsters.mjs` |
| scrape-npm.yml | Refresh npm package telemetry | `17 9 * * *` (daily, lag 24-48h) | `node scripts/scrape-npm.mjs` |
| scrape-openai-rss.yml | Refresh OpenAI news | `47 7 * * *` | `node scripts/scrape-openai-rss.mjs` |
| scrape-producthunt.yml | Refresh ProductHunt launches | `22 11,15,19,23 * * *` (4x/day staggered) | `node scripts/scrape-producthunt.mjs` |
| scrape-trending.yml | Refresh fast discovery | `7,27,47 * * * *` (3x/hour) | `scrape-trending` + `discover-recent-repos` + `scrape-reddit` + `scrape-hackernews` + `fetch-repo-metadata` |
| secrets-scan.yml | Secrets Scan (gitleaks) | `push`, `pull_request`, `workflow_dispatch` | gitleaks |
| sentry-fix-bot.yml | sentry-fix-bot | `issues.labeled` event | dispatches Claude Code Action when Sentry adds `sentry-error` label |
| seo-policy.yml | SEO Policy Guard | `push`, `pull_request`, `workflow_dispatch` | `node scripts/seo-policy-lint.mjs --fail-on-new` |
| snapshot-consensus.yml | Snapshot /consensus daily | `55 23 * * *` | `npm run snapshot:consensus` |
| snapshot-top10.yml | Snapshot /top10 daily | `55 23 * * *` | `npm run snapshot:top10` |
| snapshot-top10-sparklines.yml | Snapshot /top10 sparklines daily | `50 23 * * *` | `npm run snapshot:top10-sparklines` |
| source-outage-backfill.yml | Source outage backfill | `workflow_dispatch` only | `node scripts/source-outage-backfill.mjs --source <slug>` |
| sources-auto-recover.yml | Sources auto-recover | `*/30 * * * *` | POST `/api/cron/sources-auto-recover` |
| sre-actions-visibility.yml | SRE - Actions Visibility Snapshot | `*/15 * * * *` | snapshot of recent Actions runs |
| sre-cron-secret-rotation-guard.yml | SRE - CRON_SECRET Rotation Guard | `0 9 * * *` | guard against expired CRON_SECRET rotation |
| sre-k8s-probe-guard.yml | SRE - Kubernetes probe guard | `push`, `pull_request`, `workflow_dispatch` | k8s probe lint |
| sre-redis-restore-drill.yml | SRE Redis Restore Drill | `20 3 * * 1` (Mon 03:20) + dispatch | weekly Redis restore drill |
| sre-route-cost-attribution-verify.yml | SRE - Route Cost Attribution Verify | `17 */6 * * *` + dispatch | route-cost attribution verify (admin-token gated) |
| sweep-cross-source-mentions.yml | Sweep cross-source mentions | `0 */6 * * *` (top-50) and `15 5 * * *` (top-200) | `tsx scripts/sweep-cross-source-mentions.ts` - per-repo mentions sweep across 8 channels (twitter, reddit, hackernews, bluesky, devto, lobsters, producthunt, tavily web search). Closes the source-first blind spot left by the existing 88 source-scanners. Writes `data/repo-mentions-detail.jsonl` (raw) + `data/repo-mentions-detail-rollup.json` (top 5 per source per repo, 7d window). Honors `--queue data/profile-completion-queue.json` for audit-driven priority. |
| sweep-staleness.yml | Sweep staleness | `32 2 * * *` | `node scripts/sweep-staleness.mjs` |
| sync-trustmrr.yml | Sync TrustMRR revenue overlays | `27 2 * * *` and `27 0,1,3..23 * * *` (hourly minus 02:27 incremental, daily 02:27 full) | `node scripts/sync-trustmrr.mjs` + `compute-revenue-benchmarks.mjs` |
| trendingrepo-worker.yml | trendingrepo-worker | `push`, `pull_request`, `workflow_dispatch` | typecheck + build for the Railway worker |
| trivy-worker-image.yml | trivy-worker-image | `push`, `pull_request`, `workflow_dispatch` | trivy CVE scan of worker docker image |
| uptime-monitor.yml | Uptime monitor (every 5 minutes) | `*/5 * * * *` | uptime ping |

Unclassified: none. Every workflow has a parsed `name:` and trigger.

Total cron-driven workflows: 65. Push/PR-only or dispatch-only: 18.

---

## 2. Cron API routes (src/app/api/cron/*/route.ts) - 16 routes

Source: `Glob src/app/api/cron/**/route.ts`. Caller workflow derived from
`grep -r "/api/cron/<path>" .github/workflows/`.

| Route | Caller workflow | Auth | Purpose |
|---|---|---|---|
| `/api/cron/aiso-drain` | cron-aiso-drain.yml (`3,33 * * * *`) | Bearer `CRON_SECRET` | Drains AISO scan submission queue + emits PostHog ops event |
| `/api/cron/digest/weekly` | cron-digest-weekly.yml (`0 14 * * 5`) | Bearer `CRON_SECRET` | Renders + sends weekly digest email via Resend |
| `/api/cron/freshness/state` | cron-freshness-check.yml (`*/15 * * * *`); also smoke-tested by post-deploy-smoke.yml + release-cdn-purge | Bearer `CRON_SECRET` | Returns per-source freshness state |
| `/api/cron/github-pool-budget` | cron-github-pool-budget.yml (`*/5 * * * *`) | Bearer `CRON_SECRET` | Snapshots PAT pool remaining/reset to Redis aggregate |
| `/api/cron/llm/aggregate` | cron-llm.yml (hourly `10 * * * *`) | Bearer `CRON_SECRET` | Aggregates LLM telemetry counters |
| `/api/cron/llm/sync-models` | cron-llm.yml (daily `15 2 * * *`) | Bearer `CRON_SECRET` | Syncs LLM model catalog from upstream |
| `/api/cron/mcp/rotate-usage` | cron-mcp-usage-rotate.yml (`0 3 1 * *`) | Bearer `CRON_SECRET` | Monthly rotation of MCP usage log |
| `/api/cron/news-auto-recover` | (no scheduled workflow caller in tree as of 2026-05-05) | Bearer `CRON_SECRET` | News-feed auto-recovery (orphan; can be dispatched directly) |
| `/api/cron/predictions` | cron-predictions.yml (`0 6 * * *`) | Bearer `CRON_SECRET` | Generates LLM-driven predictions |
| `/api/cron/predictions/calibrate` | (no scheduled workflow caller in tree) | Bearer `CRON_SECRET` | Calibrate prediction scores; orphan or in-process call |
| `/api/cron/sources-auto-recover` | sources-auto-recover.yml (`*/30 * * * *`) | Bearer `CRON_SECRET` | Auto-recovery sweep for failing sources |
| `/api/cron/subdomain-takeover` | cron-subdomain-takeover.yml (`0 3 * * 1`) | Bearer `CRON_SECRET` | Weekly subdomain takeover scan |
| `/api/cron/twitter-daily` | cron-twitter-outbound.yml (`0 14 * * *`) | Bearer `CRON_SECRET` | Daily outbound Twitter thread |
| `/api/cron/twitter-weekly-recap` | cron-twitter-outbound.yml (`0 16 * * 5`) | Bearer `CRON_SECRET` | Friday weekly recap thread |
| `/api/cron/webhooks/flush` | cron-webhooks-flush.yml (`5,35 * * * *`) | Bearer `CRON_SECRET` | Drains webhook queue |
| `/api/cron/webhooks/scan` | cron-webhooks-flush.yml (`5,35 * * * *`, runs before flush) | Bearer `CRON_SECRET` | Enqueues breakouts + funding rows |

Auth pattern: every route uses `verifyCronAuth` (or equivalent) reading
the `Authorization: Bearer <CRON_SECRET>` header. Routes marked orphan
have a route handler in tree but no `.github/workflows/*.yml` calls
them on a schedule today.

---

## 3. Worker (apps/trendingrepo-worker/) - 44 active fetchers

Source: `apps/trendingrepo-worker/src/registry.ts` (`FETCHERS[]`) +
each fetcher's `index.ts`. Schedules are 5-field UTC cron strings used
by `croner` in `src/schedule.ts`. Every fetcher writes to the
`ss:data:v1:<name>` Redis key via `src/lib/redis.ts`.

`_template/` is the deliberate scaffolding template (see
`_template/README.md`). The four prior stubs (`huggingface`, `github`,
`mcp-so`, `mcp-servers-repo`) were deleted 2026-05-05 (they only
emitted "not yet implemented" warnings every cron tick). The three
real-but-unwired implementations (`ai-blogs`, `arxiv`,
`github-events`) have full code + tests but are not in `FETCHERS[]`
yet — see the banner comment at the top of each `index.ts` for the
promotion path. `agent-commerce/` is data-only (just `seed-data.json`,
no `index.ts`; consumed by `scripts/build-agent-commerce-seed.mjs`).

| Fetcher | Schedule (UTC) | Output Redis key | Notes |
|---|---|---|---|
| hn-pulse | `*/10 * * * *` | `hn-pulse` | high-frequency HN signals |
| consensus-analyst | `0 * * * *` | `consensus-analyst` | Kimi K2.6 driven; bounded concurrency 4 (~5 min wall) |
| hackernews | `10 * * * *` | `hackernews` | |
| oss-trending | `22 * * * *` | `oss-trending` | OSS Insight |
| recent-repos | `25 * * * *` | `recent-repos` | |
| trustmrr | `27 * * * *` | `trustmrr` | matches sync-trustmrr.yml hourly slot |
| trendshift-daily | `35 * * * *` | `trendshift-daily` | |
| deltas | `40 * * * *` | `deltas` | |
| repo-profiles | `41 * * * *` | `repo-profiles` | matches enrich-repo-profiles.yml |
| engagement-composite | `45 * * * *` | `engagement-composite` | |
| consensus-trending | `50 * * * *` | `consensus-trending` | |
| repo-metadata | `13 * * * *` | `repo-metadata` | |
| bluesky | `17 * * * *` | `bluesky` | |
| reddit | `30 * * * *` | `reddit` | |
| lobsters | `37 * * * *` | `lobsters` | |
| skills-sh | `15 */2 * * *` | `skills-sh` | |
| collection-rankings | `17 */6 * * *` | `collection-rankings` | |
| mcp-smithery-rank | `11 */6 * * *` | `mcp-smithery-rank` | |
| npm-downloads | `23 */6 * * *` | `npm-downloads` | |
| smithery-skills | `30 */6 * * *` | `smithery-skills` | |
| pypi-downloads | `37 */6 * * *` | `pypi-downloads` | |
| crunchbase | `0 */6 * * *` | `crunchbase` | |
| funding-news | `0 */6 * * *` | `funding-news` | matches collect-funding.yml |
| claude-skills | `0 */6 * * *` | `claude-skills` | |
| skillsmp | `0 */6 * * *` | `skillsmp` | |
| mcp-registry-official | `0 */6 * * *` | `mcp-registry-official` | |
| pulsemcp | `30 */12 * * *` | `pulsemcp` | |
| skill-derivatives | `7 */12 * * *` | `skill-derivative-count` (side-channel) | |
| lobehub-skills | `45 */12 * * *` | `lobehub-skills` | |
| smithery | `0 4 * * *` | `smithery` | daily |
| manual-repos | `7 4 * * *` | `manual-repos` | operator-curated |
| revenue-manual-matches | `9 4 * * *` | `revenue-manual-matches` | operator-curated |
| revenue-benchmarks | `57 2 * * *` | `revenue-benchmarks` | daily |
| skill-install-snapshot | `0 3 * * *` | `skill-install-snapshot:<date>` | |
| skill-forks-snapshot | `13 3 * * *` | `skill-forks-snapshot` | |
| hotness-snapshot | `25 3 * * *` | `hotness-snapshot` | |
| mcp-usage-snapshot | `30 3 * * *` | `mcp-usage-snapshot` | |
| reddit-baselines | `17 3 * * 1` | `reddit-baselines` | weekly Mon |
| npm-dependents | `53 4 * * *` | `npm-dependents` | |
| producthunt | `0 11,15,19,23 * * *` | `producthunt` | 4x/day PT-aligned |
| devto | `30 8 * * *` | `devto` | |
| npm-packages | `17 9 * * *` | `npm-packages` | matches scrape-npm.yml lag window |
| x-funding | `30 0,12 * * *` | `x-funding` | 2x/day |
| glama | `15 */6 * * *` | `glama` | |

Worker entrypoint: `apps/trendingrepo-worker/src/index.ts` (`--cron` mode).
Health endpoint: `src/server.ts`. Deploy: Railway, image built per
`Dockerfile`, scanned weekly by trivy-worker-image.yml.

---

## 4. Reverse map: collector script -> calling workflow

Only collector scripts under `scripts/` that are invoked by at least one
workflow are listed. Internal utility scripts (`_*.mjs`, `audit-*`, `check-*`,
`verify-*`) are omitted.

| Script | Calling workflow(s) |
|---|---|
| scripts/aiso-monthly-regression-watcher.mjs | aiso-self-scan.yml |
| scripts/audit-freshness.mjs | audit-freshness.yml |
| scripts/append-star-activity.mjs | refresh-star-activity.yml |
| scripts/backfill-meta.mjs | backfill-meta.yml (dispatch) |
| scripts/check-docs-freshness.mjs | docs-freshness.yml |
| scripts/check-nitter-health.mjs | check-nitter.yml |
| scripts/check-profile-completion.ts | check-profile-completion.yml |
| scripts/check-source-health.mjs | health-watch.yml |
| scripts/check-v3-token-budget.mjs | ci.yml |
| scripts/compute-reddit-baselines.mjs | refresh-reddit-baselines.yml |
| scripts/compute-revenue-benchmarks.mjs | sync-trustmrr.yml |
| scripts/discover-recent-repos.mjs | scrape-trending.yml |
| scripts/enrich-arxiv.mjs | enrich-arxiv.yml |
| scripts/enrich-repo-profiles.mjs | enrich-repo-profiles.yml |
| scripts/fetch-agentic-market.mjs + fetch-coingecko-agents.mjs + fetch-openrouter-models.mjs + fetch-artificial-analysis.mjs + fetch-base-x402-onchain.mjs | cron-agent-commerce.yml |
| scripts/fetch-repo-metadata.mjs | scrape-trending.yml |
| scripts/ping-mcp-liveness.mjs | ping-mcp-liveness.yml |
| scripts/probe-reddit-endpoints.mjs | probe-reddit.yml (dispatch) |
| scripts/promote-unknown-mentions.mjs | promote-unknown-mentions.yml |
| scripts/run-shadow-scoring.mjs | run-shadow-scoring.yml |
| scripts/scrape-arxiv.mjs | scrape-arxiv.yml |
| scripts/scrape-awesome-skills.mjs | scrape-awesome-skills.yml |
| scripts/scrape-bluesky.mjs | scrape-bluesky.yml |
| scripts/scrape-claude-rss.mjs | scrape-claude-rss.yml |
| scripts/scrape-devto.mjs | scrape-devto.yml |
| scripts/scrape-hackernews.mjs | scrape-trending.yml |
| scripts/scrape-huggingface.mjs + -datasets + -spaces | scrape-huggingface*.yml (3 workflows) |
| scripts/scrape-lobsters.mjs | scrape-lobsters.yml |
| scripts/scrape-npm.mjs | scrape-npm.yml |
| scripts/scrape-openai-rss.mjs | scrape-openai-rss.yml |
| scripts/scrape-producthunt.mjs | scrape-producthunt.yml |
| scripts/scrape-reddit.mjs | scrape-trending.yml + refresh-reddit-baselines.yml |
| scripts/scrape-trending.mjs | scrape-trending.yml + refresh-collection-rankings.yml (`--only-collection-rankings`) |
| scripts/seo-policy-lint.mjs | seo-policy.yml |
| scripts/source-outage-backfill.mjs | source-outage-backfill.yml (dispatch) |
| scripts/sweep-cross-source-mentions.ts (+ scripts/_cross-source-search.mjs) | sweep-cross-source-mentions.yml |
| scripts/sweep-staleness.mjs | sweep-staleness.yml |
| scripts/sync-trustmrr.mjs | sync-trustmrr.yml |
| scripts/collect-twitter-signals.ts (via `npm run collect:twitter`) | collect-twitter.yml |
| scripts/scrape-funding (via `npm run scrape:funding`) | collect-funding.yml |
| (npm script) snapshot:consensus | snapshot-consensus.yml |
| (npm script) snapshot:top10 | snapshot-top10.yml |
| (npm script) snapshot:top10-sparklines | snapshot-top10-sparklines.yml |

---

## 5. Keys / credentials

Source: `.env.example` (141 lines) + `src/lib/env.ts` schema +
grep of `process.env.*` across `scripts/` and `apps/trendingrepo-worker/src/`.

### 5a. Required (production fail-closed in env.ts)

| Var | Used by | Source |
|---|---|---|
| `GITHUB_TOKEN` | runtime pipeline + every `scripts/*.mjs` GitHub call | env.ts schema, env.example |
| `CRON_SECRET` | `/api/cron/*` Bearer auth + every `cron-*.yml` workflow | env.ts schema, env.example |

Boot guard in `env.ts:142-164`: production throws unless
`TRENDINGREPO_ALLOW_MISSING_ENV=true` (or legacy `STARSCREENER_ALLOW_MISSING_ENV`).

### 5b. GitHub PAT pool

| Var | Used by | Notes |
|---|---|---|
| `GH_TOKEN_POOL` | `src/lib/github-token-pool.ts` | canonical CSV pool name (GH Actions reserves the `GITHUB_*` prefix) |
| `GITHUB_TOKEN_POOL` | same | back-compat alias, deduped at parse |
| `GITHUB_PAT_PROD`, `GITHUB_PAT_TEST` | env.ts schema | reserved test/prod single-PAT slots |

### 5c. Admin / session

| Var | Used by | Notes |
|---|---|---|
| `ADMIN_TOKEN` | admin API verifyAdminAuth | required separate from CRON_SECRET; routes return 503 when missing |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_TOTP_SECRET`, `SESSION_SECRET` | `/api/admin/login` cookie path | all four required together |
| `ADMIN_IP_BLOCKLIST` | optional CSV blocklist | edge-IP based |
| `INTERNAL_AGENT_TOKENS_JSON` | `verifyInternalAgentAuth()` | JSON `{name:token}` or `{name:[new,old]}` for graceful rotation |

### 5d. Persistence (Redis - one of two)

| Var | Used by | Notes |
|---|---|---|
| `REDIS_URL` | `src/lib/data-store.ts` (ioredis backend) | Railway TCP `redis://` / `rediss://` |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | data-store (Upstash REST backend) | legacy; never set both |

### 5e. External-service keys

| Var | Used by | Source surface |
|---|---|---|
| `APIFY_API_TOKEN`, `APIFY_TWITTER_ACTOR`, `APIFY_PROXY_GROUPS`, `APIFY_PROXY_COUNTRY` | `scripts/_apify-*` + worker | Twitter `apidojo~tweet-scraper`, optional Reddit residential proxy |
| `TAVILY_API_KEY` | `scripts/_cross-source-search.mjs` (sweep) | web-search channel for sweep-cross-source-mentions; 1000/mo free tier |
| `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` | scripts + worker bluesky fetcher | bot account |
| `DEVTO_API_KEY`, `DEVTO_API_KEYS` | `scripts/_devto-shared.mjs` + worker devto fetcher | round-robin pool |
| `PRODUCTHUNT_TOKEN`, `PRODUCTHUNT_TOKENS` | `scripts/scrape-producthunt.mjs` (`loadProducthuntTokens`) + worker | round-robin pool |
| `HF_TOKEN`, `HF_TOKENS`, `HF_CARD_FETCH_LIMIT`, `HF_SPACES_CARD_FETCH_LIMIT` | huggingface scrape scripts | single token (HF_TOKENS reserved for future pool) |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` | reddit scripts + worker | OAuth app |
| `FIRECRAWL_API_KEY`, `FIRECRAWL_API_KEYS` | worker funding-news + crunchbase fetchers | crawler |
| `LIBRARIES_IO_API_KEY` | worker funding-news fetcher | OSS funding signals |
| `KIMI_BASE_URL`, `KIMI_MODEL` | worker consensus-analyst | optional moonshot.ai swap (defaults to api.kimi.com/coding/v1) |
| `AA_API_KEY` | scripts/fetch-artificial-analysis.mjs | agent-commerce pipeline |
| `DUNE_API_KEY` | scripts/fetch-dune-x402.mjs | onchain agent commerce |
| `SOLANA_RPC_URL` | scripts/fetch-solana-x402-onchain.mjs | onchain |
| `INDEXNOW_KEY` | scripts/seo helpers | bing/yandex push |
| `TRUSTMRR_API_KEY`, `TRUSTMRR_INTERVAL_MS`, `TRUSTMRR_PAGE_SIZE` | scripts/sync-trustmrr.mjs + worker trustmrr fetcher | revenue overlay |

### 5f. Observability + delivery

| Var | Used by | Notes |
|---|---|---|
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | scripts/_logger.mjs + Next runtime + worker | org `agnt-pf` (EU `de.sentry.io`), project id 4511285393686608 |
| `POSTHOG_KEY`, `POSTHOG_API_KEY`, `POSTHOG_HOST`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | `src/lib/analytics/posthog.ts` + uptime workflow | shared with AISO + AGNT |
| `RESEND_API_KEY`, `EMAIL_FROM`, `DIGEST_ENABLED`, `DIGEST_USER_EMAILS_JSON` | `/api/cron/digest/weekly` | gated; opt-in master flag |
| `OPS_ALERT_WEBHOOK` | platform-fatal alerts | HTTPS only |

### 5g. Public-route protection

| Var | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | `/api/repo-submissions`, `/api/submissions/revenue` | Cloudflare Turnstile gate |
| `PORTAL_CORS_ALLOWED_ORIGINS` | `/portal` + `/portal/call` | CSV origins |
| `SUBDOMAIN_TAKEOVER_TARGETS_JSON` | `/api/cron/subdomain-takeover` | empty -> 503 by design |

### 5h. AISO scan protocol (pluggable)

`AISO_API_URL`, `AISO_TOOLS_API_URL`, `AISOTOOLS_API_URL`,
`AISO_SCAN_PROTOCOL`, `AISO_SCAN_SUBMIT_PATH`,
`AISO_SCAN_STATUS_PATH_TEMPLATE`, `AISO_SCAN_RESULT_PATH_TEMPLATE`,
`AISO_SCAN_MODE`, `AISO_SCAN_POLL_MS`, `AISO_SCAN_TIMEOUT_MS`,
`AISO_REGRESSION_THRESHOLD`, `AISO_PARENT_ISSUE_ID`,
`AISO_WATCH_URL`, `AISO_API_BASE_URL`, `AGN792_AISO_API_URL`,
`AGN792_AISO_URL`, `TRENDINGREPO_AISO_AUTO_SCAN`. All consumed by
`scripts/aiso-*` and the related session-opening flow.

### 5i. Tuning knobs (worker + script behavior)

`NPM_*` family (8 vars), `REPO_METADATA_BATCH_SIZE`,
`REPO_METADATA_MISSING_LIMIT`, `REPO_METADATA_MISSING_DELAY_MS`,
`PROFILE_ENRICH_LIMIT`, `GITHUB_EVENTS_CONCURRENCY`,
`GITHUB_EVENTS_WATCHLIST_TARGET`, `MANUAL_DATA_SOURCE_REPO`,
`MANUAL_DATA_SOURCE_BRANCH`, `PROMOTE_MIN_SOURCES`, `PROMOTE_TOP_N`,
`SNAPSHOT_MAX_AGE_HOURS`, `METADATA_MAX_FAILURE_RATE`,
`BUNDLE_BUDGET_GROWTH_RATIO`, `BUNDLE_SIZE_BUDGET_KB`,
`HEAP_DRILL_*` (3 vars), `TWITTER_COLLECTOR_*` (~16 vars),
`STARSCREENER_PERSIST` / `TRENDINGREPO_PERSIST` (alias),
`STARSCREENER_DATA_DIR` / `TRENDINGREPO_DATA_DIR` (alias),
`DATA_STORE_DISABLE`, `LOG_LEVEL`, `NODE_ENV`,
`TRENDINGREPO_ALLOW_MOCK`, `TRENDINGREPO_ALLOW_MISSING_ENV`.

### 5j. Paperclip / agent-tooling glue

`PAPERCLIP_API_KEY`, `PAPERCLIP_API_URL`, `PAPERCLIP_COMPANY_ID`,
`AGN_561_ISSUE_ID`, `ISSUE_ID`, `INTERNAL_AGENT_TOKEN`. Used by
script-side bot pushes; not part of runtime.

Total distinct env vars seen across both env.example + grep:
~115 (counting families like `NPM_*` once = ~85 unique; full
machine-readable list belongs in a generated artifact, not here).

---

## 6. Anti-patterns (already-burned, copied verbatim from CLAUDE.md)

- Don't switch Twitter collector back to API mode -- it silently fails on Vercel.
- Don't mock Redis in tests that exercise scoring logic -- 2026-Q1 incident.
- Don't use cookie-based Twitter scrapers -- dead provider.
- Don't `readFileSync(process.cwd(), "data", ...)` for new data sources -- use the data-store. The reason filesystem reads worked at all is that bundled JSON is baked into each Vercel deploy; that coupled data freshness to deploys and caused 17-34 deploys/day from data churn alone (commit `87e3f4e`, 2026-04-26).
- Don't add a new collector that only writes to a file -- wire `writeDataStore("<slug>", payload)` from `scripts/_data-store-write.mjs` so the write lands in Redis too. File mirror is allowed during transition but Redis is the truth.
- Kimi For Coding endpoint requires `stream: true`. Non-stream calls hang silently (HTTP 000, fetch fails). The wrapper at `apps/trendingrepo-worker/src/fetchers/consensus-analyst/llm.ts` streams + accumulates; don't revert. Same endpoint also enforces a User-Agent allowlist (`claude-cli`, `RooCode`, `Kilo-Code`).
- Don't sequential-loop the consensus-analyst sweep. K2.6 is ~80s per call; sequential 14 = 18 min, blowing the hourly slot. Use the bounded-concurrency queue (concurrency 4 -> ~5 min wall).
- Parallel-session merges silently steal staged work. When 4 agents work the same workspace concurrently, `git add` + `git commit` interleave: agent A's `git add file-a` lands in agent B's `git commit`. Always `git add <SPECIFIC-FILE>` (never `-A` or `.`), and commit immediately after each Write.
- Audit premises must be verified before believing. The 2026-05-01 ultra audit claimed 3 P0s lived on `feat/v4-alert-rules`; verification showed they were never on any branch. M6: memory is suspect.

---

## 7. How to add a new collector

Defer to `.claude/skills/project/new-cron-route` for the full recipe.
Quick checklist:

1. Decide GH-Actions-driven (data lives in `.data/*.jsonl` + Redis dual-write) or worker fetcher (Redis-only, registry.ts entry, croner schedule).
2. Workflow path: add `.github/workflows/<slug>.yml` with `schedule.cron` staggered off the `:00` burst minute. Run `node scripts/<slug>.mjs` and `writeDataStore("<slug>", payload)` via `scripts/_data-store-write.mjs`.
3. Worker path: add `apps/trendingrepo-worker/src/fetchers/<slug>/index.ts` with `name`, `schedule`, `run()`. Import + push into `FETCHERS[]` in `registry.ts`.
4. Sidecar: write `data/_meta/<slug>.json` via `scripts/_data-meta.mjs:writeSourceMeta` so `audit-freshness.yml` can score it.
5. Reader lib: add `refreshXxxFromStore()` in `src/lib/<slug>.ts` following the 30s-rate-limit + in-flight-dedupe pattern from `src/lib/trending.ts`.
6. Env: declare new keys in `.env.example` + the Zod schema in `src/lib/env.ts` if read at runtime.
7. Update this ENGINE.md in the same commit.
