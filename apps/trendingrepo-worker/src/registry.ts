import type { Fetcher } from './lib/types.js';

import bluesky from './fetchers/bluesky/index.js';
import hackernews from './fetchers/hackernews/index.js';
import devto from './fetchers/devto/index.js';
import reddit from './fetchers/reddit/index.js';
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
import xFunding from './fetchers/x-funding/index.js';
import trustmrr from './fetchers/trustmrr/index.js';
import revenueBenchmarks from './fetchers/revenue-benchmarks/index.js';
import redditBaselines from './fetchers/reddit-baselines/index.js';
import engagementComposite from './fetchers/engagement-composite/index.js';
import trendshiftDaily from './fetchers/trendshift-daily/index.js';
import consensusTrending from './fetchers/consensus-trending/index.js';
import consensusAnalyst from './fetchers/consensus-analyst/index.js';
// Phase B Group 2 (social)
import lobsters from './fetchers/lobsters/index.js';
import twitter from './fetchers/twitter/index.js';
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
// Sprint 3.2 wave 3 — register fetchers whose data was previously produced by
// GH Action workflows (scrape-arxiv.yml + enrich-arxiv.yml for arxiv;
// scrape-claude-rss.yml + scrape-openai-rss.yml for ai-blogs, which already
// covers 6 lab RSS sources via AI_LAB_REGISTRY).
import arxiv from './fetchers/arxiv/index.js';
import aiBlogs from './fetchers/ai-blogs/index.js';
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
// DORP intake-queue consumer — drains `queue:drop-a-repo` every minute and
// calls back to the Vercel /enrich endpoint to run the existing pipeline
// ingest. See header for the producer/consumer contract.
import dropIntakeDrain from './fetchers/drop-intake-drain/index.js';
// DORP deep-enrich consumer — drains `queue:drop-deep-enrich` every minute and
// builds the community profile + LLM editorial overview for a freshly-listed
// drop NOW (instead of waiting for the daily community-profile sweep). Producer
// is the app's /enrich endpoint (LPUSH on status → listed).
import dropDeepEnrichDrain from './fetchers/drop-deep-enrich-drain/index.js';
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
// Daily deep-coverage sweep of consensus-trending ranks 31-200, skipping any
// fullName already in consensus-verdicts.items. Closes the gap between the
// primary analyst's hourly TOP_N=30 and the full 200-item pool that
// consensus-trending publishes. Wave 3 — 2026-05-27.
import consensusAnalystTail from './fetchers/consensus-analyst-tail/index.js';
// LLM-written evergreen expert overviews for the /best/[topic] answer-surfaces
// (GEO citation lever). Daily; writes `editorial-best`; app reads it via
// src/lib/editorial-store.ts and prefers it over the deterministic intro.
import editorialWriter from './fetchers/editorial-writer/index.js';

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
  xFunding,
  trustmrr,
  revenueBenchmarks,
  redditBaselines,
  trendshiftDaily,
  engagementComposite,
  consensusTrending,
  consensusAnalyst,
  lobsters,
  bluesky,
  hackernews,
  devto,
  reddit,
  twitter,
  mentionsLedger,
  npmDownloads,
  pypiDownloads,
  npmDependents,
  hotnessSnapshot,
  arxiv,
  aiBlogs,
  lmarena,
  artificialanalysis,
  openrouterModels,
  dropIntakeDrain,
  dropDeepEnrichDrain,
  crossSourceSweep,
  repoRegistry,
  repoCommunityProfile,
  starActivity,
  consensusAnalystTail,
  editorialWriter,
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
