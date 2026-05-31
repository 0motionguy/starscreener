import type { Fetcher } from './lib/types.js';

import bluesky from './fetchers/bluesky/index.js';
import hackernews from './fetchers/hackernews/index.js';
import devto from './fetchers/devto/index.js';
import producthunt from './fetchers/producthunt/index.js';
import hnPulse from './fetchers/hn-pulse/index.js';
// Phase B Group 1 (signals)
import ossTrending from './fetchers/oss-trending/index.js';
import recentRepos from './fetchers/recent-repos/index.js';
import deltas from './fetchers/deltas/index.js';
import collectionRankings from './fetchers/collection-rankings/index.js';
// Phase B Group 3 (enrichment)
import repoProfiles from './fetchers/repo-profiles/index.js';
import repoMetadata from './fetchers/repo-metadata/index.js';
import npmPackages from './fetchers/npm-packages/index.js';
import crunchbase from './fetchers/crunchbase/index.js';
import fundingNews from './fetchers/funding-news/index.js';
import trustmrr from './fetchers/trustmrr/index.js';
import revenueBenchmarks from './fetchers/revenue-benchmarks/index.js';
// Live Reddit collection is intentionally paused until the operator provisions
// OAuth client-credentials on HOSTUP. Keep weekly baselines registered because
// they are a separate slow-moving snapshot.
import redditBaselines from './fetchers/reddit-baselines/index.js';
import engagementComposite from './fetchers/engagement-composite/index.js';
import trendshiftDaily from './fetchers/trendshift-daily/index.js';
import consensusTrending from './fetchers/consensus-trending/index.js';
import consensusAnalyst from './fetchers/consensus-analyst/index.js';
// Phase B Group 2 (social)
import lobsters from './fetchers/lobsters/index.js';
import twitter from './fetchers/twitter/index.js';
// Twitter tier 2 + 3 — H4 of the 2026-05-30 handover. Hot covers ranks
// 1..50 hourly; warm scans ranks 51..500 every 6h via a rotating Redis
// cursor; cold walks the registry tail (ranks 501+) daily, also cursor-
// paged. All three share the camofox+nitter scan loop in
// twitter/_scan.ts and write into the cumulative mentions ledger.
import twitterWarm from './fetchers/twitter-warm/index.js';
import twitterCold from './fetchers/twitter-cold/index.js';
// Cumulative mentions ledger — reads snapshot slugs (HN, Reddit, Bluesky,
// Dev.to, Lobsters), runs SADD + HINCRBY for new mention IDs.
import mentionsLedger from './fetchers/mentions-ledger/index.js';
// Operator-curated data file producers (close the chicken-egg gaps that left
// `manual-repos` + `revenue-manual-matches` consumed-but-never-produced
// under worker-only mode).
import manualRepos from './fetchers/manual-repos/index.js';
import revenueManualMatches from './fetchers/revenue-manual-matches/index.js';
// npm / pypi side-channels — kept because they serve repo analytics
// (package download / dependent counts referenced by the repos surface),
// not just the now-removed MCP merger.
import npmDownloads from './fetchers/npm-downloads/index.js';
import pypiDownloads from './fetchers/pypi-downloads/index.js';
import npmDependents from './fetchers/npm-dependents/index.js';
import hotnessSnapshot from './fetchers/hotness-snapshot/index.js';
// LLM quality signals — Artificial Analysis Intelligence Index (AA_API_KEY
// required). The /?cat=llms surface clones the AA leaderboard.
import lmarena from './fetchers/lmarena/index.js';
import artificialanalysis from './fetchers/artificialanalysis/index.js';
// OpenRouter model marketplace — catalogue (pricing/context/modality/created)
// joined with live weekly-usage rank. Powers the /?cat=models adoption surface
// (complement to the AA quality leaderboard on /?cat=llms). 6-hourly, public
// APIs, no key. Full-catalogue snapshot with shouldPreserveCache zero-write
// guard.
import openrouterModels from './fetchers/openrouter-models/index.js';
// OpenRouter weekly per-MODEL token-volume time-series + top-30 latest-week
// leaderboard with WoW deltas. Powers the rebuilt /?cat=models chart +
// sidebar. Official endpoint when OPENROUTER_API_KEY is set; brittle
// Server Action fallback otherwise. 6-hourly, offset by 13m from
// openrouter-models so they don't contend.
import openrouterUsage from './fetchers/openrouter-usage/index.js';
// DORP intake-queue consumer — drains `queue:drop-a-repo` every minute and
// calls back to the Vercel /enrich endpoint to run the existing pipeline
// ingest. See header for the producer/consumer contract.
import dropIntakeDrain from './fetchers/drop-intake-drain/index.js';
// DORP deep-enrich consumer — drains `queue:drop-deep-enrich` every minute and
// builds the community profile + LLM editorial overview for a freshly-listed
// drop NOW (instead of waiting for the daily community-profile sweep). Producer
// is the app's /enrich endpoint (LPUSH on status → listed).
import dropDeepEnrichDrain from './fetchers/drop-deep-enrich-drain/index.js';
// On-demand twitter scan consumer — drains `queue:drop-twitter` every minute,
// runs ONE camofox→nitter scan per repo, and SADDs the projected tweet IDs
// straight into ss:mentions:v1:<repo>:twitter via applyLedger. Pickup
// latency ~60s + scan ~10s → newly-dropped repos show a Twitter mention
// count on their profile within ~1-2 min (vs ~31h via hourly rotation).
import dropTwitterDrain from './fetchers/drop-twitter-drain/index.js';
// Repo-first cross-source mention sweep — for the top-100 (consensus-trending),
// searches HN/Reddit/dev.to/Bluesky/ProductHunt(+Tavily) per repo and publishes
// `repo-mentions-detail-rollup` to redis (the detail behind profile source pips).
import crossSourceSweep from './fetchers/cross-source-sweep/index.js';
// Persistent accumulating repo collection — unions trending/recent/metadata/
// consensus into a durable `repo-registry` slug (never drops), so the tracked
// count grows past 1000 and dropped repos are retained. App reads it via
// src/lib/derived-repos/loaders/registry.ts.
import repoRegistry from './fetchers/repo-registry/index.js';
// Scheduled batch enrichment of community profile (license, languages, org,
// README, etc.) for the registry's top-N by recency. Closes the gap where
// dropped/registry-only repos show "—" in RepoOwnerRepoSnapshot because the
// existing on-demand path (src/lib/repo-community-profile.ts) is only
// triggered by signed-in users. Wave 3A — 2026-05-27.
import repoCommunityProfile from './fetchers/repo-community-profile/index.js';
// Daily forward-append of one cumulative star-count point per registry
// repo. Mirrors scripts/append-star-activity.mjs (which only sees the
// trending tier) and adds registry-tier coverage so dropped repos get a
// timeline too. Closes the "Star history not yet available" surface for
// the long tail. Wave C1 — 2026-05-27.
import starActivity from './fetchers/star-activity/index.js';
// GitHub-direct 24h/7d/30d star deltas computed from the per-repo
// `star-activity` daily series — the OSS-Insight-independent backbone for
// the homepage Top/Gainer/Trend tabs. Removes the single point of failure
// where an api.ossinsight.io outage blanked every 7d/30d delta. Daily
// 05:30 UTC, after star-activity has appended today's points. App reads it
// via src/lib/star-activity-deltas.ts. Wave — 2026-05-29.
import starActivityDeltas from './fetchers/star-activity-deltas/index.js';
// Our OWN recurring star-velocity engine (OSS-Insight-independent). Two tiers:
//  - velocity-refresh: every 40 min, CHEAP top-N `/repos` snapshot → refreshes
//    24h/7d/30d numbers and merges them into the `star-activity-deltas` slug.
//  - velocity-seed: daily, BOUNDED+THROTTLED newest-first stargazer walk that
//    seeds the recent 7d/30d anchor points the refresh diffs against. The naive
//    full-registry walk does NOT scale (secondary rate limit), so the walk stays
//    bounded to the top-N movers. See each fetcher's header + docs/ENGINE.md.
import velocityRefresh from './fetchers/velocity-refresh/index.js';
import velocitySeed from './fetchers/velocity-seed/index.js';
// Daily FULL-REGISTRY star-velocity backfill via GraphQL stargazer timestamps
// (the token pool). velocity-refresh/seed only cover the top-N by velocity;
// this gives the ~700-repo long tail real stars_now + 24h/7d/30d so the board
// isn't half "— — —". ClickHouse/GH-Archive was ruled out (playground ~6wk
// stale); GraphQL stargazers(last:100) is cost-1, live, and retroactive.
import velocityBackfill from './fetchers/velocity-backfill/index.js';
// Daily 90D stacked-by-category star-delta roll-up for the home-hero chart.
// Reads repo-registry + all `star-activity:*` slugs, sums per-day deltas into
// 7 hero buckets, writes `stars-by-category-daily`. Runs daily 06:00 UTC
// after star-activity (04:17) + star-activity-deltas (05:30).
import starsByCategory from './fetchers/stars-by-category/index.js';
// Daily deep-coverage sweep of consensus-trending ranks 31-200, skipping any
// fullName already in consensus-verdicts.items. Closes the gap between the
// primary analyst's hourly TOP_N=30 and the full 200-item pool that
// consensus-trending publishes. Wave 3 — 2026-05-27.
import consensusAnalystTail from './fetchers/consensus-analyst-tail/index.js';
// LLM-written evergreen expert overviews for the /best/[topic] answer-surfaces
// (GEO citation lever). Daily; writes `editorial-best`; app reads it via
// src/lib/editorial-store.ts and prefers it over the deterministic intro.
import editorialWriter from './fetchers/editorial-writer/index.js';
// Sibling editorial fetchers — LLM-written evergreen overviews for the other
// GEO answer-surfaces. All share _editorial/run.ts (read→generate→merge→
// never-empty). Daily, staggered after editorial-writer. App readers:
// src/lib/editorial-{categories,compare,alternatives}.ts.
import editorialCategories from './fetchers/editorial-categories/index.js';
import editorialCompare from './fetchers/editorial-compare/index.js';
import editorialAlternatives from './fetchers/editorial-alternatives/index.js';

export const FETCHERS: Fetcher[] = [
  hnPulse,
  ossTrending,
  recentRepos,
  deltas,
  collectionRankings,
  manualRepos,
  revenueManualMatches,
  repoProfiles,
  repoMetadata,
  npmPackages,
  fundingNews,
  crunchbase,
  trustmrr,
  revenueBenchmarks,
  redditBaselines,
  trendshiftDaily,
  engagementComposite,
  consensusTrending,
  consensusAnalyst,
  lobsters,
  twitterWarm,
  twitterCold,
  bluesky,
  hackernews,
  devto,
  producthunt,
  twitter,
  mentionsLedger,
  npmDownloads,
  pypiDownloads,
  npmDependents,
  hotnessSnapshot,
  lmarena,
  artificialanalysis,
  openrouterModels,
  openrouterUsage,
  dropIntakeDrain,
  dropDeepEnrichDrain,
  dropTwitterDrain,
  crossSourceSweep,
  repoRegistry,
  repoCommunityProfile,
  starActivity,
  starActivityDeltas,
  velocityRefresh,
  velocitySeed,
  velocityBackfill,
  starsByCategory,
  consensusAnalystTail,
  editorialWriter,
  editorialCategories,
  editorialCompare,
  editorialAlternatives,
];

export function getFetcher(name: string): Fetcher | undefined {
  return FETCHERS.find((f) => f.name === name);
}

export function listFetcherNames(): string[] {
  return FETCHERS.map((f) => f.name);
}

// Move 1, Phase 1 — SOURCE_CONTRACTS array.
//
// `sources.json` is the source registry. Each row is asserted to satisfy the
// SourceContract type via the `as` cast through the unknown bridge, then
// re-typed as readonly so callers cannot mutate. JSON imports widen string
// literals (e.g. `"active"` → `string`), so a direct `satisfies` clause
// cannot narrow the unions — Phase 1 deliverable C
// (`scripts/verify-source-contract.mjs`) is the runtime gate that catches
// shape drift, paired with `npm run render:source-audit` which fails loudly
// on missing fields. Move 1 implementation step 4 wires
// `npm run registry-check` into CI so PRs that delete a row without prior
// `state: 'deprecated'` are blocked. See:
//   - apps/trendingrepo-worker/src/platform/source-contract.ts (the type)
//   - apps/trendingrepo-worker/src/platform/sources.json     (the data)
//   - docs/SOURCE-REGISTRY-PROPOSAL.md (Move 1 implementation proposal)
import sourcesData from './platform/sources.json' with { type: 'json' };
import type { SourceContract } from './platform/source-contract.js';
export const SOURCE_CONTRACTS: readonly SourceContract[] =
  sourcesData as readonly SourceContract[];
