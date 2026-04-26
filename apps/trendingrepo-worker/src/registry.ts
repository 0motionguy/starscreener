import type { Fetcher } from './lib/types.js';

import huggingface from './fetchers/huggingface/index.js';
import bluesky from './fetchers/bluesky/index.js';
import pulsemcp from './fetchers/pulsemcp/index.js';
import smithery from './fetchers/smithery/index.js';
import mcpRegistryOfficial from './fetchers/mcp-registry-official/index.js';
import glama from './fetchers/glama/index.js';
import claudeSkills from './fetchers/claude-skills/index.js';
import skillsSh from './fetchers/skills-sh/index.js';
import skillsmp from './fetchers/skillsmp/index.js';
import smitherySkills from './fetchers/smithery-skills/index.js';
import lobehubSkills from './fetchers/lobehub-skills/index.js';
import hackernews from './fetchers/hackernews/index.js';
import producthunt from './fetchers/producthunt/index.js';
import devto from './fetchers/devto/index.js';
import reddit from './fetchers/reddit/index.js';
import hnPulse from './fetchers/hn-pulse/index.js';
// 3 stubs (`github`, `mcp-so`, `mcp-servers-repo`) intentionally NOT imported
// here — they were registered + ticking but only emitted "not yet implemented"
// warnings, polluting Sentry every cron tick. Files remain in src/fetchers/
// as documentation of intent; re-add to FETCHERS once a real port lands.
// Phase B Group 1 (signals)
import ossTrending from './fetchers/oss-trending/index.js';
import recentRepos from './fetchers/recent-repos/index.js';
import deltas from './fetchers/deltas/index.js';
import collectionRankings from './fetchers/collection-rankings/index.js';
// Phase B Group 3 (enrichment)
import repoProfiles from './fetchers/repo-profiles/index.js';
import repoMetadata from './fetchers/repo-metadata/index.js';
import npmPackages from './fetchers/npm-packages/index.js';
import fundingNews from './fetchers/funding-news/index.js';
import trustmrr from './fetchers/trustmrr/index.js';
import revenueBenchmarks from './fetchers/revenue-benchmarks/index.js';
import redditBaselines from './fetchers/reddit-baselines/index.js';
// Phase B Group 2 (social) - lobsters is the only NEW name; bluesky/devto/
// hackernews/producthunt/reddit replaced their stub bodies in place and so
// their existing imports above pick up the real implementations transparently.
import lobsters from './fetchers/lobsters/index.js';
// Tier 2 audit fixes — operator-curated data file producers (close the
// chicken-egg gaps that left `manual-repos` + `revenue-manual-matches`
// consumed-but-never-produced under worker-only mode).
import manualRepos from './fetchers/manual-repos/index.js';
import revenueManualMatches from './fetchers/revenue-manual-matches/index.js';
// Phase 0 of the research-layer signal: arxiv submissions in cs.AI/CL/LG/MA.
import arxiv from './fetchers/arxiv/index.js';
// Phase 3.4 (funding source coverage) — Crunchbase RSS + X funding hashtags.
// Both produce funding-news-shape signals to separate slugs; consumer
// merge in src/lib/funding-news.ts is a follow-up.
import crunchbase from './fetchers/crunchbase/index.js';
import xFunding from './fetchers/x-funding/index.js';
// Phase 3.1 — engagement composite scoring. Joins 7 upstream signal slugs
// into a 0-100 leaderboard score per repo. Hourly :45 (after the staggered
// upstream cluster ends at :40 with deltas).
import engagementComposite from './fetchers/engagement-composite/index.js';

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
  trustmrr,
  revenueBenchmarks,
  redditBaselines,
  lobsters,
  huggingface,
  bluesky,
  mcpRegistryOfficial,
  glama,
  pulsemcp,
  smithery,
  claudeSkills,
  skillsSh,
  skillsmp,
  smitherySkills,
  lobehubSkills,
  hackernews,
  producthunt,
  devto,
  reddit,
  arxiv,
  crunchbase,
  xFunding,
  engagementComposite,
];

export function getFetcher(name: string): Fetcher | undefined {
  return FETCHERS.find((f) => f.name === name);
}

export function listFetcherNames(): string[] {
  return FETCHERS.map((f) => f.name);
}
