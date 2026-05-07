---
generated-at: 2026-05-07T05:53:38.030Z
tool: scripts/render-source-audit.mjs
warning: do not edit by hand — regenerate via `npm run render:source-audit`
---

# Source Fleet Audit — 2026-05-07

## Summary

- **Total sources:** 69
- **State breakdown:**
  - active: 55
  - intent-only: 14
- **Owner UNASSIGNED:** 69
- **Intent-only (decision pending):** 14

## repo-derived (14)

| id | kind | state | owner | freshness | cost_class | primary_output_keys | depends_on | upstream |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| collection-rankings | collector | active | **UNASSIGNED** | 12.0h | rate_limit_pct | collection-rankings | oss-trending | https://api.ossinsight.io/v1/collections/{id}/ranking_by_{metric}/ |
| consensus-analyst | enrichment | active | **UNASSIGNED** | 4.0h | usd | consensus-verdicts | consensus-trending, repo-metadata | https://api.kimi.com/coding/v1 |
| consensus-trending | enrichment | active | **UNASSIGNED** | 2.0h | none | consensus-trending | trendshift-daily, oss-trending, engagement-composite | multiple |
| deltas | enrichment | active | **UNASSIGNED** | 2.0h | none | deltas | oss-trending | multiple |
| engagement-composite | enrichment | active | **UNASSIGNED** | 2.0h | none | engagement-composite | oss-trending, repo-metadata | multiple |
| github | collector | intent-only | **UNASSIGNED** | 1.0h | pat_quota_pct | github-trending |  | https://api.github.com |
| github-events | collector | intent-only | **UNASSIGNED** | 30m | pat_quota_pct | github-events:_index | engagement-composite, repo-metadata | https://api.github.com/repos/{owner}/{name}/events |
| manual-repos | collector | active | **UNASSIGNED** | 2.0d | none | manual-repos |  | https://raw.githubusercontent.com/0motionguy/starscreener/main/data/manual-repos.json |
| oss-trending | collector | active | **UNASSIGNED** | 4.0h | rate_limit_pct | trending, hot-collections |  | https://api.ossinsight.io/v1/trends/repos/, https://api.ossinsight.io/v1/collections/hot/ |
| recent-repos | collector | active | **UNASSIGNED** | 2.0h | pat_quota_pct | recent-repos |  | https://api.github.com/search/repositories |
| repo-metadata | enrichment | active | **UNASSIGNED** | 2.0h | pat_quota_pct | repo-metadata | manual-repos, oss-trending, recent-repos | https://api.github.com/graphql |
| repo-profiles | enrichment | active | **UNASSIGNED** | 2.0h | pat_quota_pct | repo-profiles | repo-metadata | https://api.github.com/repos/{owner}/{name} |
| trending | collector | active | **UNASSIGNED** | 4.0h | rate_limit_pct | trending, hot-collections |  | https://api.ossinsight.io/v1/trends/repos/, https://api.ossinsight.io/v1/collections/hot/ |
| trendshift-daily | collector | active | **UNASSIGNED** | 1.0d | none | trendshift-daily |  | https://trendshift.io/?trending-limit=100 |

> **intent-only — `github`**
> decision_pending: Stub fetcher only emits 'not yet implemented' warnings; oss-trending + recent-repos + repo-metadata already cover GitHub. Ship the planned port (Phase B) OR delete the stub file?

> **intent-only — `github-events`**
> decision_pending: github-events fetcher exists in apps/trendingrepo-worker/src/fetchers/github-events but is NOT imported in registry.ts FETCHERS — confirm whether to wire it (it's a producer for the watchlist real-time pane) or delete; current state is code-complete-but-unwired.

## social (9)

| id | kind | state | owner | freshness | cost_class | primary_output_keys | depends_on | upstream |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bluesky | collector | active | **UNASSIGNED** | 6.0h | rate_limit_pct | bluesky-mentions, bluesky-trending |  | https://bsky.social |
| devto | collector | active | **UNASSIGNED** | 1.0d | rate_limit_pct | devto-mentions, devto-trending |  | https://dev.to/api |
| hackernews | collector | active | **UNASSIGNED** | 6.0h | rate_limit_pct | hackernews-trending, hackernews-repo-mentions |  | https://hacker-news.firebaseio.com/v0, https://hn.algolia.com/api/v1 |
| hn-pulse | snapshot | active | **UNASSIGNED** | 30m | rate_limit_pct | hn-pulse |  | https://hacker-news.firebaseio.com/v0/topstories.json |
| lobsters | collector | active | **UNASSIGNED** | 12.0h | rate_limit_pct | lobsters-trending, lobsters-mentions |  | https://lobste.rs/hottest.json, https://lobste.rs/active.json (+1) |
| producthunt | collector | active | **UNASSIGNED** | 12.0h | rate_limit_pct | producthunt-launches |  | https://api.producthunt.com/v2/api/graphql |
| reddit | collector | active | **UNASSIGNED** | 6.0h | rate_limit_pct | reddit-mentions, reddit-all-posts | reddit-baselines | https://www.reddit.com/r/{sub}/new.json |
| reddit-baselines | enrichment | active | **UNASSIGNED** | 14.0d | rate_limit_pct | reddit-baselines |  | https://www.reddit.com/r/{sub}/new.json |
| twitter-signals | collector | intent-only | **UNASSIGNED** | 12.0h | apify_units | twitter-repo-signals, twitter-scans, twitter-ingestion-audit | repo-metadata | https://api.apify.com/v2/acts/apidojo~tweet-scraper, https://twitter.com (+1) |

> **intent-only — `twitter-signals`**
> decision_pending: Twitter signals are written by scripts/collect-twitter-signals.ts (workflow-side, no scrape-<id>.mjs match). The verifier check 2 cannot match this row to a worker fetcher OR a scrape-<id>.mjs script. Either: (a) rename script to scripts/scrape-twitter-signals.mjs/ts, (b) add a worker fetcher that wraps the collector, or (c) extend the verifier to recognize collect-*.ts scripts. State stays 'active' downgraded to 'intent-only' once decision is recorded.

## package (5)

| id | kind | state | owner | freshness | cost_class | primary_output_keys | depends_on | upstream |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| npm-daily | snapshot | active | **UNASSIGNED** | 1.0d | rate_limit_pct | npm-dependents |  | https://libraries.io/api/npm/{package} |
| npm-dependents | snapshot | active | **UNASSIGNED** | 1.0d | rate_limit_pct | mcp-dependents | mcp-registry-official | https://libraries.io/api/npm/{package} |
| npm-downloads | snapshot | active | **UNASSIGNED** | 12.0h | rate_limit_pct | mcp-downloads | mcp-registry-official, smithery, glama (+1) | https://api.npmjs.org/downloads/point/last-week/, https://registry.npmjs.org/ |
| npm-packages | collector | active | **UNASSIGNED** | 1.0d | rate_limit_pct | npm-packages |  | https://registry.npmjs.org/-/v1/search, https://api.npmjs.org/downloads/range/ |
| pypi-downloads | snapshot | active | **UNASSIGNED** | 12.0h | rate_limit_pct | mcp-downloads-pypi | mcp-registry-official, smithery | https://pypistats.org/api/packages/{pkg}/recent |

## model (4)

| id | kind | state | owner | freshness | cost_class | primary_output_keys | depends_on | upstream |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| huggingface | collector | intent-only | **UNASSIGNED** | 1.0d | rate_limit_pct | huggingface-trending |  | https://huggingface.co/api |
| huggingface-datasets | collector | active | **UNASSIGNED** | 1.0d | rate_limit_pct | huggingface-datasets |  | https://huggingface.co/api/datasets |
| huggingface-models-script | collector | intent-only | **UNASSIGNED** | 1.0d | rate_limit_pct | huggingface-trending |  | https://huggingface.co/api/models |
| huggingface-spaces | collector | active | **UNASSIGNED** | 1.0d | rate_limit_pct | huggingface-spaces |  | https://huggingface.co/api/spaces |

> **intent-only — `huggingface`**
> decision_pending: Stub worker fetcher; the active writer is scripts/scrape-huggingface.mjs (workflow-side). Ship the worker port per ~/.claude/plans/huggingface-fetcher-plan.md OR delete the stub file?

> **intent-only — `huggingface-models-script`**
> decision_pending: Verifier check 2 expects scripts/scrape-<id>.mjs OR a fetcher; the active writer is scripts/scrape-huggingface.mjs (slug 'huggingface') but the worker fetcher 'huggingface' is intent-only stub. Naming collision — this row exists to register the script's source-family separately from the stub fetcher row. Decision: rename script to scrape-hf-models.mjs OR rename worker stub OR collapse rows once HuggingFace strategy is locked.

## mcp (8)

| id | kind | state | owner | freshness | cost_class | primary_output_keys | depends_on | upstream |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| glama | collector | active | **UNASSIGNED** | 6.0h | rate_limit_pct | trending-mcp |  | https://glama.ai/api/mcp/v1 |
| mcp-registry-official | collector | active | **UNASSIGNED** | 6.0h | none | trending-mcp |  | https://registry.modelcontextprotocol.io/v0 |
| mcp-servers-repo | collector | intent-only | **UNASSIGNED** | 1.0d | pat_quota_pct | mcp-servers-repo |  | https://github.com/modelcontextprotocol/servers |
| mcp-smithery-rank | snapshot | active | **UNASSIGNED** | 12.0h | rate_limit_pct | mcp-smithery-rank | smithery | https://registry.smithery.ai/servers |
| mcp-so | collector | intent-only | **UNASSIGNED** | 1.0d | usd | trending-mcp-so |  | https://mcp.so |
| mcp-usage-snapshot | snapshot | active | **UNASSIGNED** | 1.0d | none | pattern: mcp-usage-snapshot:<date> | mcp-registry-official, smithery, glama (+1) | multiple |
| pulsemcp | collector | active | **UNASSIGNED** | 12.0h | rate_limit_pct | trending-mcp |  | https://api.pulsemcp.com/v0.1 |
| smithery | collector | active | **UNASSIGNED** | 1.0d | rate_limit_pct | trending-mcp |  | https://registry.smithery.ai |

> **intent-only — `mcp-servers-repo`**
> decision_pending: Stub fetcher for parsing the MCP servers monorepo. Ship the planned port (Phase B) OR delete (mcp-registry-official already pulls the official catalog)?

> **intent-only — `mcp-so`**
> decision_pending: Stub fetcher; mcp.so has no public API and would require Firecrawl crawl. Ship the Firecrawl-based port OR delete (mcp-registry-official + glama + pulsemcp + smithery already cover the surface)?

## skill (9)

| id | kind | state | owner | freshness | cost_class | primary_output_keys | depends_on | upstream |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| awesome-skills | collector | active | **UNASSIGNED** | 1.0d | pat_quota_pct | awesome-skills |  | https://api.github.com/repos/anthropics/awesome-claude-code-skills |
| claude-skills | collector | active | **UNASSIGNED** | 6.0h | pat_quota_pct | trending-skill |  | https://api.github.com/search/repositories |
| lobehub-skills | collector | active | **UNASSIGNED** | 12.0h | usd | trending-skill-lobehub |  | https://lobehub.com/skills |
| skill-derivatives | snapshot | active | **UNASSIGNED** | 1.0d | pat_quota_pct | skill-derivative-count | claude-skills, skills-sh | https://api.github.com/search/code |
| skill-forks-snapshot | snapshot | active | **UNASSIGNED** | 1.0d | none | pattern: skill-forks-snapshot:<date> | claude-skills, skills-sh | multiple |
| skill-install-snapshot | snapshot | active | **UNASSIGNED** | 1.0d | none | pattern: skill-install-snapshot:<date> | claude-skills, skills-sh | multiple |
| skills-sh | collector | active | **UNASSIGNED** | 4.0h | usd | trending-skill-sh |  | https://skills.sh |
| skillsmp | collector | active | **UNASSIGNED** | 6.0h | rate_limit_pct | trending-skill-skillsmp |  | https://skillsmp.com/api/skills |
| smithery-skills | collector | active | **UNASSIGNED** | 6.0h | rate_limit_pct | trending-skill-smithery |  | https://api.smithery.ai/skills |

## funding (9)

| id | kind | state | owner | freshness | cost_class | primary_output_keys | depends_on | upstream |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| agent-commerce | collector | intent-only | **UNASSIGNED** | 1.0d | none | agent-commerce |  | multiple |
| base-x402-onchain | collector | intent-only | **UNASSIGNED** | 1.0d | rate_limit_pct | base-x402-onchain |  | https://api.basescan.org |
| crunchbase | collector | active | **UNASSIGNED** | 1.0d | none | funding-news-crunchbase |  | https://techcrunch.com/category/venture/feed/, https://news.crunchbase.com/sections/venture/feed/ (+4) |
| funding-news | collector | active | **UNASSIGNED** | 1.0d | none | funding-news |  | https://techcrunch.com/category/startups/feed/, https://venturebeat.com/feed/ (+6) |
| revenue-benchmarks | enrichment | active | **UNASSIGNED** | 2.0d | none | revenue-benchmarks | trustmrr | multiple |
| revenue-manual-matches | collector | active | **UNASSIGNED** | 2.0d | none | revenue-manual-matches |  | https://raw.githubusercontent.com/0motionguy/starscreener/main/data/revenue-manual-matches.json |
| solana-x402-onchain | collector | intent-only | **UNASSIGNED** | 1.0d | rate_limit_pct | solana-x402-onchain |  | https://api.helius.xyz |
| trustmrr | collector | active | **UNASSIGNED** | 2.0h | rate_limit_pct | trustmrr-startups, trustmrr-startups:meta, revenue-overlays | repo-metadata, repo-profiles, revenue-manual-matches | https://trustmrr.com/api/v1 |
| x-funding | collector | active | **UNASSIGNED** | 1.0d | apify_units | funding-news-x |  | https://api.apify.com/v2/acts/apidojo~tweet-scraper |

> **intent-only — `agent-commerce`**
> decision_pending: Standalone script scripts/build-agent-commerce-seed.mjs writes 'agent-commerce' but verifier check 2 expects scripts/scrape-agent-commerce.mjs OR a worker fetcher. Decision: rename script OR port to worker fetcher OR extend verifier to recognize build-*.mjs script prefix.

> **intent-only — `base-x402-onchain`**
> decision_pending: Standalone script scripts/fetch-base-x402-onchain.mjs writes the slug but verifier check 2 expects scripts/scrape-base-x402-onchain.mjs OR a worker fetcher. Decision: rename to scrape-* OR port to worker OR extend verifier to recognize fetch-*.mjs prefix.

> **intent-only — `solana-x402-onchain`**
> decision_pending: Standalone script scripts/fetch-solana-x402-onchain.mjs writes the slug but verifier check 2 expects scripts/scrape-solana-x402-onchain.mjs OR a worker fetcher. Same decision as base-x402-onchain.

## research (5)

| id | kind | state | owner | freshness | cost_class | primary_output_keys | depends_on | upstream |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ai-blogs | collector | intent-only | **UNASSIGNED** | 1.0d | none | trending-post |  | multiple |
| arxiv | collector | active | **UNASSIGNED** | 1.0d | rate_limit_pct | arxiv-recent |  | https://export.arxiv.org/api/query |
| arxiv-enriched | enrichment | intent-only | **UNASSIGNED** | 1.0d | rate_limit_pct | arxiv-enriched | arxiv | multiple |
| claude-rss | collector | active | **UNASSIGNED** | 1.0d | none | claude-rss |  | https://www.anthropic.com/sitemap.xml |
| openai-rss | collector | active | **UNASSIGNED** | 1.0d | none | openai-rss |  | https://openai.com |

> **intent-only — `ai-blogs`**
> decision_pending: Worker fetcher exists in apps/trendingrepo-worker/src/fetchers/ai-blogs but is NOT imported in registry.ts; active writers are scripts/scrape-claude-rss.mjs + scripts/scrape-openai-rss.mjs. Re-enable the worker fetcher (RSS phase 1 only) OR delete?

> **intent-only — `arxiv-enriched`**
> decision_pending: Standalone script scripts/enrich-arxiv.mjs writes 'arxiv-enriched' but verifier check 2 expects scripts/scrape-arxiv-enriched.mjs OR a worker fetcher. Decision: port to worker enrichment fetcher OR rename script to scrape-arxiv-enriched.mjs OR extend verifier to recognize enrich-*.mjs as a registered script class.

## ops (3)

| id | kind | state | owner | freshness | cost_class | primary_output_keys | depends_on | upstream |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hotness-snapshot | snapshot | active | **UNASSIGNED** | 1.0d | none | pattern: hotness-snapshot:<domain>:<date> | claude-skills, skills-sh, mcp-registry-official | multiple |
| mcp-liveness | health | intent-only | **UNASSIGNED** | 1.0d | none | mcp-liveness | mcp-registry-official, smithery, glama (+1) | multiple |
| scoring-shadow-report | health | intent-only | **UNASSIGNED** | 1.0d | none | scoring-shadow-report | trending, engagement-composite | multiple |

> **intent-only — `mcp-liveness`**
> decision_pending: Standalone script scripts/ping-mcp-liveness.mjs writes the slug but verifier check 2 expects scripts/scrape-mcp-liveness.mjs OR a fetcher of name 'mcp-liveness'. Decision: rename ping-mcp-liveness.mjs to scrape-mcp-liveness.mjs OR port to a worker fetcher OR extend verifier to recognize ping-*/check-*/health-* script prefixes.

> **intent-only — `scoring-shadow-report`**
> decision_pending: Standalone script scripts/run-shadow-scoring.mjs writes the slug but verifier check 2 expects scripts/scrape-scoring-shadow-report.mjs OR a worker fetcher. Decision: rename OR port OR extend verifier for run-*.mjs prefix.

## user-input (3)

| id | kind | state | owner | freshness | cost_class | primary_output_keys | depends_on | upstream |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| user-input:ideas-reactions | collector | active | **UNASSIGNED** | 1.0d | none |  |  | multiple |
| user-input:repo-submissions | collector | active | **UNASSIGNED** | 1.0d | none |  |  | multiple |
| user-input:revenue-submissions | collector | active | **UNASSIGNED** | 1.0d | none |  |  | multiple |

## Open questions (advisor)

1. Where does the registry live? (code vs DB vs hybrid)
2. Owner per source — who is on-call when a source breaks?
3. Cost per month per source — what is the actual spend?
4. Freshness SLO per surface — derived from per-source budgets?
5. Backfill needs — which sources must support replay?

See [SOURCE-REGISTRY-PROPOSAL.md](./SOURCE-REGISTRY-PROPOSAL.md) for recommendations.
