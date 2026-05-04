import type { Fetcher } from './lib/types.js';

// `huggingface` worker fetcher is a stub; the real HF data comes from
// scripts/scrape-huggingface{,-datasets,-spaces}.mjs (workflow-side).
// Same treatment as the github / mcp-so / mcp-servers-repo stubs below —
// import removed so we don't ship a tick-every-4h "not yet implemented"
// warning to Sentry. Re-add once a real port lands.
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
// 4 stubs (`github`, `mcp-so`, `mcp-servers-repo`, `huggingface`)
// intentionally NOT imported here — they were registered + ticking but
// only emitted "not yet implemented" warnings, polluting Sentry every
// cron tick. Files remain in src/fetchers/ as documentation of intent;
// re-add to FETCHERS once a real port lands.
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
import engagementComposite from './fetchers/engagement-composite/index.js';
import trendshiftDaily from './fetchers/trendshift-daily/index.js';
import consensusTrending from './fetchers/consensus-trending/index.js';
import consensusAnalyst from './fetchers/consensus-analyst/index.js';
// Phase B Group 2 (social) - lobsters is the only NEW name; bluesky/devto/
// hackernews/producthunt/reddit replaced their stub bodies in place and so
// their existing imports above pick up the real implementations transparently.
import lobsters from './fetchers/lobsters/index.js';
// Tier 2 audit fixes — operator-curated data file producers (close the
// chicken-egg gaps that left `manual-repos` + `revenue-manual-matches`
// consumed-but-never-produced under worker-only mode).
import manualRepos from './fetchers/manual-repos/index.js';
import revenueManualMatches from './fetchers/revenue-manual-matches/index.js';
// Chunk C — MCP & Skill enrichment side-channels. These fetchers don't
// produce primary leaderboard items; they populate side-channel Redis keys
// (`mcp-downloads`, `mcp-dependents`, `mcp-smithery-rank`,
// `skill-derivative-count`, `skill-install-snapshot:<date>`) that
// buildMcpItem / buildSkillItem in src/lib/ecosystem-leaderboards.ts read
// at request time. Each fetcher renormalizes gracefully when its env
// dependency is missing.
import npmDownloads from './fetchers/npm-downloads/index.js';
import pypiDownloads from './fetchers/pypi-downloads/index.js';
import npmDependents from './fetchers/npm-dependents/index.js';
import mcpSmitheryRank from './fetchers/mcp-smithery-rank/index.js';
import skillDerivatives from './fetchers/skill-derivatives/index.js';
import skillInstallSnapshot from './fetchers/skill-install-snapshot/index.js';
import skillForksSnapshot from './fetchers/skill-forks-snapshot/index.js';
import hotnessSnapshot from './fetchers/hotness-snapshot/index.js';
import mcpUsageSnapshot from './fetchers/mcp-usage-snapshot/index.js';
// Funding side-channel fetchers — write `funding-news-crunchbase` and
// `funding-news-x` keys that consumers may already read but stayed
// forever stale before registration. AUDIT-2026-05-04 §A4 fix.
import crunchbase from './fetchers/crunchbase/index.js';
import xFunding from './fetchers/x-funding/index.js';

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
  npmDownloads,
  pypiDownloads,
  npmDependents,
  mcpSmitheryRank,
  skillDerivatives,
  skillInstallSnapshot,
  skillForksSnapshot,
  hotnessSnapshot,
  mcpUsageSnapshot,
];

export function getFetcher(name: string): Fetcher | undefined {
  return FETCHERS.find((f) => f.name === name);
}

export function listFetcherNames(): string[] {
  return FETCHERS.map((f) => f.name);
}
