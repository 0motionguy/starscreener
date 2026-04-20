// StarScreener — All TypeScript types for the entire app

export type MovementStatus =
  | "hot"
  | "breakout"
  | "quiet_killer"
  | "rising"
  | "stable"
  | "cooling"
  | "declining";

export type TimeRange = "24h" | "7d" | "30d";

export type SortBy = "momentum" | "stars-today" | "stars-total" | "newest";

export type SocialPlatform =
  | "twitter"
  | "reddit"
  | "hackernews"
  | "github"
  | "devto";

export type Sentiment = "positive" | "neutral" | "negative";

export interface Repo {
  id: string; // "vercel--next-js"
  fullName: string; // "vercel/next.js"
  name: string; // "next.js"
  owner: string; // "vercel"
  ownerAvatarUrl: string;
  description: string;
  url: string;
  language: string | null;
  topics: string[];
  categoryId: string;
  stars: number;
  forks: number;
  contributors: number;
  openIssues: number;
  lastCommitAt: string;
  lastReleaseAt: string | null;
  lastReleaseTag: string | null;
  createdAt: string;
  starsDelta24h: number;
  starsDelta7d: number;
  starsDelta30d: number;
  forksDelta7d: number;
  contributorsDelta30d: number;
  // Phase 3: deltas now come from git-history of data/trending.json. When a
  // given window has no usable historical snapshot (or the repo wasn't in
  // it), the corresponding delta field above is shimmed to 0 and the
  // matching *Missing flag below is set so scoring can distinguish
  // "genuinely flat" from "we don't know yet". Optional for backwards
  // compatibility with existing fixtures; the trending adapter always sets
  // hasMovementData explicitly on production paths.
  hasMovementData?: boolean;
  starsDelta24hMissing?: boolean;
  starsDelta7dMissing?: boolean;
  starsDelta30dMissing?: boolean;
  forksDelta7dMissing?: boolean;
  contributorsDelta30dMissing?: boolean;
  momentumScore: number; // 0-100
  movementStatus: MovementStatus;
  rank: number;
  categoryRank: number;
  sparklineData: number[]; // 30 data points (daily star counts)
  socialBuzzScore: number; // 0-100
  mentionCount24h: number;

  /** Set by /api/pipeline/cleanup when GitHub reports the repo archived/disabled. */
  archived?: boolean;
  /** Set by /api/pipeline/cleanup when the upstream fetch returns 404. */
  deleted?: boolean;

  /** Tags (flat, multi-label). Populated by `deriveTags` during classify pass. */
  tags?: string[];

  /** OSS Insight collection labels carried by the trending feed. */
  collectionNames?: string[];
}

export interface Category {
  id: string;
  name: string;
  shortName: string;
  description: string;
  icon: string; // Lucide icon name
  color: string; // hex
  repoCount: number;
  avgMomentum: number;
  topMoverId: string | null;
}

export interface SocialMention {
  id: string;
  repoId: string;
  platform: SocialPlatform;
  author: string;
  content: string;
  url: string;
  sentiment: Sentiment;
  engagement: number;
  postedAt: string;
}

export interface WhyMovingInsight {
  factor: string;
  headline: string;
  detail: string;
  confidence: "high" | "medium" | "low";
  timeframe: string;
}

export interface WhyMoving {
  repoId: string;
  headline: string;
  factors: WhyMovingInsight[];
}

export interface WatchlistItem {
  repoId: string;
  addedAt: string;
  starsAtAdd: number;
}

export interface AlertPreference {
  id: string;
  repoId: string | null;
  type: "stars-spike" | "new-release" | "breakout" | "rank-change";
  threshold: number;
  enabled: boolean;
}

export interface CompareRepoData {
  repo: Repo;
  starHistory: number[]; // 30 daily points
  forkHistory: number[];
}

// ---------------------------------------------------------------------------
// Terminal UI — meta filters, tabs, density, column IDs
// ---------------------------------------------------------------------------

export type MetaFilter =
  | "hot"
  | "breakouts"
  | "quiet-killers"
  | "new"
  | "discussed"
  | "rank-climbers"
  | "fresh-releases";

export type TerminalTab = "trending" | "gainers" | "new" | "watchlisted";
export type Density = "compact" | "spacious";
export type SortDirection = "asc" | "desc";

export type ColumnId =
  | "rank"
  | "repo"
  | "momentum"
  | "stars"
  | "delta24h"
  | "delta7d"
  | "delta30d"
  | "chart"
  | "forks"
  | "forksDelta7d"
  | "contrib"
  | "contribDelta30d"
  | "issues"
  | "lastRelease"
  | "lastCommit"
  | "buzz"
  | "actions";

export const DEFAULT_VISIBLE_COLUMNS: ColumnId[] = [
  "rank",
  "repo",
  "momentum",
  "stars",
  "delta24h",
  "delta7d",
  "chart",
  "lastRelease",
  "actions",
];

export const ALL_COLUMNS: ColumnId[] = [
  "rank",
  "repo",
  "momentum",
  "stars",
  "delta24h",
  "delta7d",
  "delta30d",
  "chart",
  "forks",
  "forksDelta7d",
  "contrib",
  "contribDelta30d",
  "issues",
  "lastRelease",
  "lastCommit",
  "buzz",
  "actions",
];

export type FilterBarVariant =
  | "full"
  | "search"
  | "watchlist"
  | "category"
  | "minimal";

// ---------------------------------------------------------------------------
// FeaturedCard types (placeholder — real impl in Phase 2)
// ---------------------------------------------------------------------------

export type FeaturedLabel =
  | "NUMBER_ONE_TODAY"
  | "BREAKOUT"
  | "RANK_CLIMBER"
  | "HN_FEATURED"
  | "FRESH_RELEASE"
  | "MOST_DISCUSSED"
  | "QUIET_KILLER"
  | "WATCHED_MOVING";

export interface FeaturedCard {
  label: FeaturedLabel;
  labelDisplay: string;
  repo: Repo;
  reason: string;
  deltaPercent: number;
  rankDelta: number | null;
  sparkline: number[];
}

export interface MetaCounts {
  hot: number;
  breakouts: number;
  quietKillers: number;
  new: number;
  discussed: number;
  rankClimbers: number;
  freshReleases: number;
}
