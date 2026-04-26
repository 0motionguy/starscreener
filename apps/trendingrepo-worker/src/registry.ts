import type { Fetcher } from './lib/types.js';

import huggingface from './fetchers/huggingface/index.js';
import github from './fetchers/github/index.js';
import bluesky from './fetchers/bluesky/index.js';
import pulsemcp from './fetchers/pulsemcp/index.js';
import smithery from './fetchers/smithery/index.js';
import mcpSo from './fetchers/mcp-so/index.js';
import claudeSkills from './fetchers/claude-skills/index.js';
import mcpServersRepo from './fetchers/mcp-servers-repo/index.js';
import hackernews from './fetchers/hackernews/index.js';
import producthunt from './fetchers/producthunt/index.js';
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
import fundingNews from './fetchers/funding-news/index.js';
import trustmrr from './fetchers/trustmrr/index.js';
import revenueBenchmarks from './fetchers/revenue-benchmarks/index.js';
import redditBaselines from './fetchers/reddit-baselines/index.js';
// Phase B Group 2 (social) - lobsters is the only NEW name; bluesky/devto/
// hackernews/producthunt/reddit replaced their stub bodies in place and so
// their existing imports above pick up the real implementations transparently.
import lobsters from './fetchers/lobsters/index.js';

export const FETCHERS: Fetcher[] = [
  hnPulse,
  ossTrending,
  recentRepos,
  deltas,
  collectionRankings,
  repoProfiles,
  repoMetadata,
  npmPackages,
  fundingNews,
  trustmrr,
  revenueBenchmarks,
  redditBaselines,
  lobsters,
  huggingface,
  github,
  bluesky,
  pulsemcp,
  smithery,
  mcpSo,
  claudeSkills,
  mcpServersRepo,
  hackernews,
  producthunt,
  devto,
  reddit,
];

export function getFetcher(name: string): Fetcher | undefined {
  return FETCHERS.find((f) => f.name === name);
}

export function listFetcherNames(): string[] {
  return FETCHERS.map((f) => f.name);
}
