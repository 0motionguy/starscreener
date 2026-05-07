# Source Fleet Audit (2026-05-07)

_Auto-generated from `apps/trendingrepo-worker/src/platform/sources.json` by `scripts/render-source-audit.mjs`. Do not edit by hand — re-render with `npm run render:source-audit`._

## State breakdown

| state | count |
|---|---|
| `active` | 62 |
| `intent-only` | 7 |
| **total** | **69** |

## category: `repo-derived` (14)

### `oss-trending`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 14400000 ms
- **upstream**: `https://api.ossinsight.io/v1/trends/repos/`<br>`https://api.ossinsight.io/v1/collections/hot/`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **rate limit**: 600/h / scope=ip
- **output keys**: `trending`, `hot-collections`
- **output shape**: `ranked_list`
- **consensus role**: `list`
- **consumer surfaces**: `src/lib/trending.ts`, `src/lib/hot-collections.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `repo`

### `recent-repos`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 7200000 ms
- **upstream**: `https://api.github.com/search/repositories`
- **auth**: required (github_pat_pool)
- **cost signal**: pat_quota_pct / scope=hour
- **rate limit**: 5000/h / scope=token
- **output keys**: `recent-repos`
- **output shape**: `ranked_list`
- **consumer surfaces**: `src/lib/recent-repos.ts`
- **supports backfill**: yes
- **fallback**: `cache`
- **writes canonical**: `repo`

### `deltas`

- **state**: `active`
- **kind**: enrichment
- **owner**: UNASSIGNED
- **freshness budget**: 7200000 ms
- **upstream**: `multiple`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: `deltas`
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/trending.ts`, `src/lib/derived-repos.ts`
- **depends on**: `oss-trending`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `repo`

### `collection-rankings`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 43200000 ms
- **upstream**: `https://api.ossinsight.io/v1/collections/{id}/ranking_by_{metric}/`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **rate limit**: 600/h / scope=ip
- **output keys**: `collection-rankings`
- **output shape**: `ranked_list`
- **consumer surfaces**: `src/lib/collection-rankings.ts`
- **depends on**: `oss-trending`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `repo`

### `manual-repos`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 172800000 ms
- **upstream**: `https://raw.githubusercontent.com/0motionguy/starscreener/main/data/manual-repos.json`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: `manual-repos`
- **output shape**: `metadata_table`
- **consumer surfaces**: `src/lib/repo-metadata.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `repo`

### `repo-profiles`

- **state**: `active`
- **kind**: enrichment
- **owner**: UNASSIGNED
- **freshness budget**: 7200000 ms
- **upstream**: `https://api.github.com/repos/{owner}/{name}`
- **auth**: required (github_pat_pool)
- **cost signal**: pat_quota_pct / scope=hour
- **rate limit**: 5000/h / scope=token
- **output keys**: `repo-profiles`
- **output shape**: `metadata_table`
- **consumer surfaces**: `src/lib/repo-profiles.ts`, `src/lib/api/repo-profile.ts`
- **depends on**: `repo-metadata`
- **supports backfill**: yes
- **fallback**: `cache`
- **writes canonical**: `repo`

### `repo-metadata`

- **state**: `active`
- **kind**: enrichment
- **owner**: UNASSIGNED
- **freshness budget**: 7200000 ms
- **upstream**: `https://api.github.com/graphql`
- **auth**: required (github_pat_pool)
- **cost signal**: pat_quota_pct / scope=hour
- **rate limit**: 5000/h / scope=token
- **output keys**: `repo-metadata`
- **output shape**: `metadata_table`
- **consumer surfaces**: `src/lib/repo-metadata.ts`
- **depends on**: `manual-repos`, `oss-trending`, `recent-repos`
- **supports backfill**: yes
- **fallback**: `cache`
- **writes canonical**: `repo`

### `trendshift-daily`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://trendshift.io/?trending-limit=100`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: `trendshift-daily`
- **output shape**: `ranked_list`
- **consensus role**: `list`
- **consumer surfaces**: `src/lib/consensus-trending.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `repo`

### `engagement-composite`

- **state**: `active`
- **kind**: enrichment
- **owner**: UNASSIGNED
- **freshness budget**: 7200000 ms
- **upstream**: `multiple`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: `engagement-composite`
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/engagement-composite.ts`
- **depends on**: `oss-trending`, `repo-metadata`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `repo`

### `consensus-trending`

- **state**: `active`
- **kind**: enrichment
- **owner**: UNASSIGNED
- **freshness budget**: 7200000 ms
- **upstream**: `multiple`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: `consensus-trending`
- **output shape**: `ranked_list`
- **consensus role**: `list`
- **consumer surfaces**: `src/lib/consensus-trending.ts`
- **depends on**: `trendshift-daily`, `oss-trending`, `engagement-composite`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `repo`

### `consensus-analyst`

- **state**: `active`
- **kind**: enrichment
- **owner**: UNASSIGNED
- **freshness budget**: 14400000 ms
- **upstream**: `https://api.kimi.com/coding/v1`
- **auth**: required (none)
- **cost signal**: usd / scope=day
- **output keys**: `consensus-verdicts`
- **output shape**: `extracted_signal`
- **consumer surfaces**: `src/lib/consensus-verdicts.ts`
- **depends on**: `consensus-trending`, `repo-metadata`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `repo`

### `github-events`

- **state**: `intent-only`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 1800000 ms
- **upstream**: `https://api.github.com/repos/{owner}/{name}/events`
- **auth**: required (github_pat_pool)
- **cost signal**: pat_quota_pct / scope=hour
- **rate limit**: 5000/h / scope=token
- **output keys**: `github-events:_index`
- **output shape**: `event_stream`
- **consensus role**: `event-stream`
- **consumer surfaces**: `src/lib/github-events.ts`
- **depends on**: `engagement-composite`, `repo-metadata`
- **supports backfill**: no
- **fallback**: `mark-degraded`
- **writes canonical**: `event`

> **decision_pending**: github-events fetcher exists in apps/trendingrepo-worker/src/fetchers/github-events but is NOT imported in registry.ts FETCHERS — confirm whether to wire it (it's a producer for the watchlist real-time pane) or delete; current state is code-complete-but-unwired.

### `github`

- **state**: `intent-only`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 3600000 ms
- **upstream**: `https://api.github.com`
- **auth**: required (github_pat_pool)
- **cost signal**: pat_quota_pct / scope=hour
- **output keys**: `github-trending`
- **output shape**: `ranked_list`
- **consumer surfaces**: —
- **supports backfill**: yes
- **fallback**: `skip`
- **writes canonical**: `repo`

> **decision_pending**: Stub fetcher only emits 'not yet implemented' warnings; oss-trending + recent-repos + repo-metadata already cover GitHub. Ship the planned port (Phase B) OR delete the stub file?

### `trending`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 14400000 ms
- **upstream**: `https://api.ossinsight.io/v1/trends/repos/`<br>`https://api.ossinsight.io/v1/collections/hot/`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **rate limit**: 600/h / scope=ip
- **output keys**: `trending`, `hot-collections`
- **output shape**: `ranked_list`
- **consensus role**: `list`
- **consumer surfaces**: `src/lib/trending.ts`, `src/lib/hot-collections.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `repo`

## category: `social` (9)

### `hn-pulse`

- **state**: `active`
- **kind**: snapshot
- **owner**: UNASSIGNED
- **freshness budget**: 1800000 ms
- **upstream**: `https://hacker-news.firebaseio.com/v0/topstories.json`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `hn-pulse`
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/hackernews-trending.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `mention`

### `reddit-baselines`

- **state**: `active`
- **kind**: enrichment
- **owner**: UNASSIGNED
- **freshness budget**: 1209600000 ms
- **upstream**: `https://www.reddit.com/r/{sub}/new.json`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `reddit-baselines`
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/reddit-baselines.ts`
- **supports backfill**: no
- **fallback**: `cache`

### `lobsters`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 43200000 ms
- **upstream**: `https://lobste.rs/hottest.json`<br>`https://lobste.rs/active.json`<br>`https://lobste.rs/newest/page/{n}.json`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `lobsters-trending`, `lobsters-mentions`
- **output shape**: `mention_feed`
- **consensus role**: `mention-feed`
- **consumer surfaces**: `src/lib/lobsters.ts`, `src/lib/lobsters-trending.ts`, `src/lib/sidebar-source-counts.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `mention`

### `bluesky`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 21600000 ms
- **upstream**: `https://bsky.social`
- **auth**: required (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `bluesky-mentions`, `bluesky-trending`
- **output shape**: `mention_feed`
- **consensus role**: `mention-feed`
- **consumer surfaces**: `src/lib/bluesky.ts`, `src/lib/bluesky-trending.ts`, `src/lib/sidebar-source-counts.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `mention`

### `hackernews`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 21600000 ms
- **upstream**: `https://hacker-news.firebaseio.com/v0`<br>`https://hn.algolia.com/api/v1`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **rate limit**: 5000/h / scope=ip
- **output keys**: `hackernews-trending`, `hackernews-repo-mentions`
- **output shape**: `mention_feed`
- **consensus role**: `mention-feed`
- **consumer surfaces**: `src/lib/hackernews.ts`, `src/lib/hackernews-trending.ts`, `src/lib/sidebar-source-counts.ts`
- **supports backfill**: yes
- **fallback**: `cache`
- **writes canonical**: `mention`

### `producthunt`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 43200000 ms
- **upstream**: `https://api.producthunt.com/v2/api/graphql`
- **auth**: required (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `producthunt-launches`
- **output shape**: `mention_feed`
- **consensus role**: `mention-feed`
- **consumer surfaces**: `src/lib/producthunt.ts`, `src/lib/sidebar-source-counts.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `mention`

### `devto`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://dev.to/api`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `devto-mentions`, `devto-trending`
- **output shape**: `mention_feed`
- **consensus role**: `mention-feed`
- **consumer surfaces**: `src/lib/devto.ts`, `src/lib/devto-trending.ts`, `src/lib/sidebar-source-counts.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `mention`

### `reddit`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 21600000 ms
- **upstream**: `https://www.reddit.com/r/{sub}/new.json`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `reddit-mentions`, `reddit-all-posts`
- **output shape**: `mention_feed`
- **consensus role**: `mention-feed`
- **consumer surfaces**: `src/lib/reddit-data.ts`, `src/lib/reddit-all-data.ts`, `src/lib/sidebar-source-counts.ts`
- **depends on**: `reddit-baselines`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `mention`

### `twitter-signals`

- **state**: `intent-only`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 43200000 ms
- **upstream**: `https://api.apify.com/v2/acts/apidojo~tweet-scraper`<br>`https://twitter.com`<br>`https://nitter.net`
- **auth**: required (apify_token)
- **cost signal**: apify_units / scope=day
- **output keys**: `twitter-repo-signals`, `twitter-scans`, `twitter-ingestion-audit`
- **output shape**: `mention_feed`
- **consensus role**: `mention-feed`
- **consumer surfaces**: `src/lib/twitter/signal-data.ts`, `src/lib/twitter/builder.ts`
- **depends on**: `repo-metadata`
- **supports backfill**: no
- **fallback**: `provider-chain`
- **providers**: `apify-tweet-scraper` (primary, cost=apify_units), `twitter-web` (fallback, cost=rate_limit_pct), `nitter` (fallback, cost=rate_limit_pct), `fixture` (fallback, cost=none)
- **writes canonical**: `mention`

> **decision_pending**: Twitter signals are written by scripts/collect-twitter-signals.ts (workflow-side, no scrape-<id>.mjs match). The verifier check 2 cannot match this row to a worker fetcher OR a scrape-<id>.mjs script. Either: (a) rename script to scripts/scrape-twitter-signals.mjs/ts, (b) add a worker fetcher that wraps the collector, or (c) extend the verifier to recognize collect-*.ts scripts. State stays 'active' downgraded to 'intent-only' once decision is recorded.

## category: `package` (5)

### `npm-packages`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://registry.npmjs.org/-/v1/search`<br>`https://api.npmjs.org/downloads/range/`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `npm-packages`
- **output shape**: `ranked_list`
- **consumer surfaces**: `src/lib/npm.ts`
- **supports backfill**: yes
- **fallback**: `cache`
- **writes canonical**: `package`

### `npm-downloads`

- **state**: `active`
- **kind**: snapshot
- **owner**: UNASSIGNED
- **freshness budget**: 43200000 ms
- **upstream**: `https://api.npmjs.org/downloads/point/last-week/`<br>`https://registry.npmjs.org/`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `mcp-downloads`
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **depends on**: `mcp-registry-official`, `smithery`, `glama`, `pulsemcp`
- **supports backfill**: yes
- **fallback**: `cache`
- **writes canonical**: `package`, `mcp`

### `pypi-downloads`

- **state**: `active`
- **kind**: snapshot
- **owner**: UNASSIGNED
- **freshness budget**: 43200000 ms
- **upstream**: `https://pypistats.org/api/packages/{pkg}/recent`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `mcp-downloads-pypi`
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **depends on**: `mcp-registry-official`, `smithery`
- **supports backfill**: yes
- **fallback**: `cache`
- **writes canonical**: `package`, `mcp`

### `npm-dependents`

- **state**: `active`
- **kind**: snapshot
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://libraries.io/api/npm/{package}`
- **auth**: required (none)
- **cost signal**: rate_limit_pct / scope=day
- **output keys**: `mcp-dependents`
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/npm-dependents.ts`
- **depends on**: `mcp-registry-official`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `package`, `mcp`

### `npm-daily`

- **state**: `active`
- **kind**: snapshot
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://libraries.io/api/npm/{package}`
- **auth**: required (none)
- **cost signal**: rate_limit_pct / scope=day
- **output keys**: `npm-dependents`
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/npm-dependents.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `package`

## category: `model` (4)

### `huggingface`

- **state**: `intent-only`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://huggingface.co/api`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `huggingface-trending`
- **output shape**: `ranked_list`
- **consumer surfaces**: `src/lib/huggingface.ts`
- **supports backfill**: no
- **fallback**: `skip`
- **writes canonical**: `model`

> **decision_pending**: Stub worker fetcher; the active writer is scripts/scrape-huggingface.mjs (workflow-side). Ship the worker port per ~/.claude/plans/huggingface-fetcher-plan.md OR delete the stub file?

### `huggingface-datasets`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://huggingface.co/api/datasets`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `huggingface-datasets`
- **output shape**: `ranked_list`
- **consumer surfaces**: `src/lib/hf-datasets.ts`, `src/lib/sidebar-source-counts.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `model`

### `huggingface-spaces`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://huggingface.co/api/spaces`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `huggingface-spaces`
- **output shape**: `ranked_list`
- **consumer surfaces**: `src/lib/hf-spaces.ts`, `src/lib/sidebar-source-counts.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `model`

### `huggingface-models-script`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://huggingface.co/api/models`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `huggingface-trending`
- **output shape**: `ranked_list`
- **consumer surfaces**: `src/lib/huggingface.ts`, `src/lib/sidebar-source-counts.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `model`
- **script**: `scripts/scrape-huggingface.mjs`

## category: `mcp` (8)

### `mcp-registry-official`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 21600000 ms
- **upstream**: `https://registry.modelcontextprotocol.io/v0`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: `trending-mcp`
- **output shape**: `ranked_list`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `mcp`

### `glama`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 21600000 ms
- **upstream**: `https://glama.ai/api/mcp/v1`
- **auth**: required (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `trending-mcp`
- **output shape**: `ranked_list`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `mcp`

### `pulsemcp`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 43200000 ms
- **upstream**: `https://api.pulsemcp.com/v0.1`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `trending-mcp`
- **output shape**: `ranked_list`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `mcp`

### `smithery`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://registry.smithery.ai`
- **auth**: required (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `trending-mcp`
- **output shape**: `ranked_list`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **supports backfill**: no
- **fallback**: `skip`
- **writes canonical**: `mcp`

### `mcp-smithery-rank`

- **state**: `active`
- **kind**: snapshot
- **owner**: UNASSIGNED
- **freshness budget**: 43200000 ms
- **upstream**: `https://registry.smithery.ai/servers`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `mcp-smithery-rank`
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **depends on**: `smithery`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `mcp`

### `mcp-usage-snapshot`

- **state**: `active`
- **kind**: snapshot
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `multiple`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: pattern: `mcp-usage-snapshot:<date>` (cardinality: static)
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **depends on**: `mcp-registry-official`, `smithery`, `glama`, `pulsemcp`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `mcp`

### `mcp-so`

- **state**: `intent-only`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://mcp.so`
- **auth**: no (firecrawl)
- **cost signal**: usd / scope=month
- **output keys**: `trending-mcp-so`
- **output shape**: `ranked_list`
- **consumer surfaces**: —
- **supports backfill**: no
- **fallback**: `skip`
- **writes canonical**: `mcp`

> **decision_pending**: Stub fetcher; mcp.so has no public API and would require Firecrawl crawl. Ship the Firecrawl-based port OR delete (mcp-registry-official + glama + pulsemcp + smithery already cover the surface)?

### `mcp-servers-repo`

- **state**: `intent-only`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://github.com/modelcontextprotocol/servers`
- **auth**: required (github_pat_pool)
- **cost signal**: pat_quota_pct / scope=hour
- **output keys**: `mcp-servers-repo`
- **output shape**: `metadata_table`
- **consumer surfaces**: —
- **supports backfill**: no
- **fallback**: `skip`
- **writes canonical**: `mcp`

> **decision_pending**: Stub fetcher for parsing the MCP servers monorepo. Ship the planned port (Phase B) OR delete (mcp-registry-official already pulls the official catalog)?

## category: `skill` (9)

### `claude-skills`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 21600000 ms
- **upstream**: `https://api.github.com/search/repositories`
- **auth**: required (github_pat_pool)
- **cost signal**: pat_quota_pct / scope=hour
- **rate limit**: 5000/h / scope=token
- **output keys**: `trending-skill`
- **output shape**: `ranked_list`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `skill`

### `skills-sh`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 14400000 ms
- **upstream**: `https://skills.sh`
- **auth**: no (firecrawl)
- **cost signal**: usd / scope=month
- **output keys**: `trending-skill-sh`
- **output shape**: `ranked_list`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `skill`

### `skillsmp`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 21600000 ms
- **upstream**: `https://skillsmp.com/api/skills`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `trending-skill-skillsmp`
- **output shape**: `ranked_list`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `skill`

### `smithery-skills`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 21600000 ms
- **upstream**: `https://api.smithery.ai/skills`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `trending-skill-smithery`
- **output shape**: `ranked_list`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `skill`

### `lobehub-skills`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 43200000 ms
- **upstream**: `https://lobehub.com/skills`
- **auth**: no (firecrawl)
- **cost signal**: usd / scope=month
- **output keys**: `trending-skill-lobehub`
- **output shape**: `ranked_list`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `skill`

### `skill-derivatives`

- **state**: `active`
- **kind**: snapshot
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://api.github.com/search/code`
- **auth**: required (github_pat_pool)
- **cost signal**: pat_quota_pct / scope=hour
- **rate limit**: 30/h / scope=token
- **output keys**: `skill-derivative-count`
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **depends on**: `claude-skills`, `skills-sh`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `skill`

### `skill-install-snapshot`

- **state**: `active`
- **kind**: snapshot
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `multiple`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: pattern: `skill-install-snapshot:<date>` (cardinality: static)
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **depends on**: `claude-skills`, `skills-sh`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `skill`

### `skill-forks-snapshot`

- **state**: `active`
- **kind**: snapshot
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `multiple`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: pattern: `skill-forks-snapshot:<date>` (cardinality: static)
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **depends on**: `claude-skills`, `skills-sh`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `skill`

### `awesome-skills`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://api.github.com/repos/anthropics/awesome-claude-code-skills`
- **auth**: required (github_pat_pool)
- **cost signal**: pat_quota_pct / scope=hour
- **rate limit**: 5000/h / scope=token
- **output keys**: `awesome-skills`
- **output shape**: `metadata_table`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `skill`

## category: `funding` (9)

### `revenue-manual-matches`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 172800000 ms
- **upstream**: `https://raw.githubusercontent.com/0motionguy/starscreener/main/data/revenue-manual-matches.json`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: `revenue-manual-matches`
- **output shape**: `metadata_table`
- **consumer surfaces**: `src/lib/revenue-overlays.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `company`, `repo`

### `funding-news`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://techcrunch.com/category/startups/feed/`<br>`https://venturebeat.com/feed/`<br>`https://sifted.eu/feed`<br>`https://arstechnica.com/feed/`<br>`https://tech.eu/feed/`<br>`https://www.pymnts.com/feed/`<br>`https://feeds.bbci.co.uk/news/technology/rss.xml`<br>`https://www.wired.com/feed/`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: `funding-news`
- **output shape**: `extracted_signal`
- **consumer surfaces**: `src/lib/funding-news.ts`, `src/lib/funding/aggregate.ts`
- **supports backfill**: no
- **fallback**: `editorial-seed`
- **writes canonical**: `company`, `mention`

### `crunchbase`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://techcrunch.com/category/venture/feed/`<br>`https://news.crunchbase.com/sections/venture/feed/`<br>`https://techfundingnews.com/feed/`<br>`https://www.alleywatch.com/feed/`<br>`https://www.finsmes.com/feed`<br>`https://news.crunchbase.com/sections/startups/feed/`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: `funding-news-crunchbase`
- **output shape**: `extracted_signal`
- **consumer surfaces**: `src/lib/funding/aggregate.ts`
- **supports backfill**: no
- **fallback**: `editorial-seed`
- **writes canonical**: `company`, `mention`

### `x-funding`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://api.apify.com/v2/acts/apidojo~tweet-scraper`
- **auth**: required (apify_token)
- **cost signal**: apify_units / scope=day
- **output keys**: `funding-news-x`
- **output shape**: `extracted_signal`
- **consumer surfaces**: `src/lib/funding/aggregate.ts`
- **supports backfill**: no
- **fallback**: `skip`
- **writes canonical**: `company`, `mention`

### `trustmrr`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 7200000 ms
- **upstream**: `https://trustmrr.com/api/v1`
- **auth**: required (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `trustmrr-startups`, `trustmrr-startups:meta`, `revenue-overlays`
- **output shape**: `metadata_table`
- **consumer surfaces**: `src/lib/revenue-overlays.ts`, `src/lib/revenue-startups.ts`
- **depends on**: `repo-metadata`, `repo-profiles`, `revenue-manual-matches`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `company`

### `revenue-benchmarks`

- **state**: `active`
- **kind**: enrichment
- **owner**: UNASSIGNED
- **freshness budget**: 172800000 ms
- **upstream**: `multiple`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: `revenue-benchmarks`
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/revenue-benchmarks.ts`
- **depends on**: `trustmrr`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `company`

### `agent-commerce`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `multiple`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: `agent-commerce`
- **output shape**: `extracted_signal`
- **consumer surfaces**: `src/lib/agent-commerce.ts`
- **supports backfill**: no
- **fallback**: `editorial-seed`
- **writes canonical**: `company`
- **script**: `scripts/build-agent-commerce-seed.mjs`

### `base-x402-onchain`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://api.basescan.org`
- **auth**: required (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `base-x402-onchain`
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/base-x402-onchain.ts`
- **supports backfill**: yes
- **fallback**: `cache`

### `solana-x402-onchain`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://api.helius.xyz`
- **auth**: required (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `solana-x402-onchain`
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/solana-x402-onchain.ts`
- **supports backfill**: yes
- **fallback**: `cache`

## category: `research` (5)

### `ai-blogs`

- **state**: `intent-only`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `multiple`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: `trending-post`
- **output shape**: `ranked_list`
- **consumer surfaces**: `src/lib/rss-feeds.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `mention`

> **decision_pending**: Worker fetcher exists in apps/trendingrepo-worker/src/fetchers/ai-blogs but is NOT imported in registry.ts; active writers are scripts/scrape-claude-rss.mjs + scripts/scrape-openai-rss.mjs. Re-enable the worker fetcher (RSS phase 1 only) OR delete?

### `arxiv`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://export.arxiv.org/api/query`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `arxiv-recent`
- **output shape**: `extracted_signal`
- **consumer surfaces**: `src/lib/arxiv.ts`
- **supports backfill**: yes
- **fallback**: `cache`
- **writes canonical**: `repo`, `mention`

### `claude-rss`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://www.anthropic.com/sitemap.xml`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: `claude-rss`
- **output shape**: `extracted_signal`
- **consumer surfaces**: `src/lib/rss-feeds.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `mention`

### `openai-rss`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `https://openai.com`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: `openai-rss`
- **output shape**: `extracted_signal`
- **consumer surfaces**: `src/lib/rss-feeds.ts`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `mention`

### `arxiv-enriched`

- **state**: `active`
- **kind**: enrichment
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `multiple`
- **auth**: no (none)
- **cost signal**: rate_limit_pct / scope=hour
- **output keys**: `arxiv-enriched`
- **output shape**: `extracted_signal`
- **consumer surfaces**: `src/lib/arxiv.ts`
- **depends on**: `arxiv`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `repo`, `mention`
- **script**: `scripts/enrich-arxiv.mjs`

## category: `ops` (3)

### `hotness-snapshot`

- **state**: `active`
- **kind**: snapshot
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `multiple`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: pattern: `hotness-snapshot:<domain>:<date>` (cardinality: enum)
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **depends on**: `claude-skills`, `skills-sh`, `mcp-registry-official`
- **supports backfill**: no
- **fallback**: `cache`
- **writes canonical**: `skill`, `mcp`

### `mcp-liveness`

- **state**: `active`
- **kind**: health
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `multiple`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: `mcp-liveness`
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/ecosystem-leaderboards.ts`
- **depends on**: `mcp-registry-official`, `smithery`, `glama`, `pulsemcp`
- **supports backfill**: no
- **fallback**: `mark-degraded`
- **writes canonical**: `mcp`

### `scoring-shadow-report`

- **state**: `active`
- **kind**: health
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `multiple`
- **auth**: no (none)
- **cost signal**: none
- **output keys**: `scoring-shadow-report`
- **output shape**: `metric_snapshot`
- **consumer surfaces**: `src/lib/pipeline/shadow-mode.ts`
- **depends on**: `trending`, `engagement-composite`
- **supports backfill**: no
- **fallback**: `cache`
- **script**: `scripts/run-shadow-scoring.mjs`

## category: `user-input` (3)

### `user-input:repo-submissions`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `multiple`
- **auth**: required (supabase_service)
- **cost signal**: none
- **output keys**: _(none — route handler writes to Supabase)_
- **output shape**: `extracted_signal`
- **consumer surfaces**: `src/app/api/repo-submissions/route.ts`, `src/app/api/admin/unknown-mentions/route.ts`
- **supports backfill**: no
- **fallback**: `none`
- **writes canonical**: `repo`, `mention`

### `user-input:revenue-submissions`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `multiple`
- **auth**: required (supabase_service)
- **cost signal**: none
- **output keys**: _(none — route handler writes to Supabase)_
- **output shape**: `extracted_signal`
- **consumer surfaces**: `src/app/api/submissions/revenue/route.ts`, `src/app/api/admin/revenue-queue/route.ts`
- **supports backfill**: no
- **fallback**: `none`
- **writes canonical**: `company`

### `user-input:ideas-reactions`

- **state**: `active`
- **kind**: collector
- **owner**: UNASSIGNED
- **freshness budget**: 86400000 ms
- **upstream**: `multiple`
- **auth**: required (supabase_service)
- **cost signal**: none
- **output keys**: _(none — route handler writes to Supabase)_
- **output shape**: `mention_feed`
- **consumer surfaces**: `src/app/api/ideas/route.ts`, `src/app/api/reactions/route.ts`, `src/app/api/admin/ideas-queue/route.ts`
- **supports backfill**: no
- **fallback**: `none`
- **writes canonical**: `mention`
