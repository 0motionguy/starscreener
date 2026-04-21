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

export type SortBy =
  | "momentum"
  | "stars-today"
  | "stars-total"
  | "newest"
  | "cross-signal";

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
  trendScore24h?: number;
  trendScore7d?: number;
  trendScore30d?: number;
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

  /**
   * Four-channel cross-signal score. Sum of github + reddit + HN + Bluesky
   * components, each 0-1 normalized. Range: 0-4.0. Higher = repo firing
   * across more channels with stronger signal. Computed at derived-repos
   * assembly time, after movement classification + scoring.
   */
  crossSignalScore?: number;

  /**
   * Number of cross-signal channels firing (component > 0). Range: 0-5.
   * Drives the 5-dot indicator and the "Cross-Signal Breakouts" filter.
   */
  channelsFiring?: number;

  /**
   * Per-channel firing state. Precomputed server-side in attachCrossSignal
   * so the ChannelDots client component doesn't have to import the
   * cross-signal module (which transitively pulls every per-source
   * mentions JSON into the client bundle — see Sprint 1 finding #3).
   */
  channelStatus?: {
    github: boolean;
    reddit: boolean;
    hn: boolean;
    bluesky: boolean;
    devto: boolean;
  };

  /**
   * Bluesky mention rollup attached during derived-repos assembly. null
   * when the repo has no mentions in the last 7d (quiet), the rollup
   * otherwise. Kept minimal on the Repo so the homepage bundle doesn't
   * carry every matched post — the full list stays in
   * data/bluesky-mentions.json for the badge tooltip fetch.
   */
  bluesky?: {
    mentions7d: number;
    likes7d: number;
    reposts7d: number;
    topPost?: {
      uri: string;
      bskyUrl: string;
      text: string;
      likes: number;
      reposts: number;
      author: { handle: string; displayName?: string };
    };
  } | null;

  /**
   * dev.to writeup rollup. null when no tracked-repo article in last 7d.
   * Sparse by design — most repos won't have a tutorial written about
   * them in any given week. Mirrors the bluesky rollup shape: minimal
   * top-article ref so the homepage bundle doesn't carry every article
   * (full list stays in data/devto-mentions.json).
   */
  devto?: {
    mentions7d: number;
    reactions7d: number;
    comments7d: number;
    topArticle?: {
      id: number;
      title: string;
      url: string;
      author: string;
      reactions: number;
      comments: number;
      readingTime: number;
    };
  } | null;

  /**
   * ProductHunt launch match — set only when a tracked repo has a recent PH
   * launch (last 7d) whose website/description links to github.com/<repo>.
   * Null/undefined for most repos (sparse by design). Drives the PhBadge on
   * repo rows + the "🚀 Hot launch" indicator when combined with cross-
   * signal channel firing.
   */
  producthunt?: {
    launchedOnPH: boolean;
    launch: {
      id: string;
      name: string;
      votesCount: number;
      daysSinceLaunch: number;
      url: string;
    };
  } | null;
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
  | "trend"
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
  "stars",
  "delta24h",
  "delta7d",
  "delta30d",
  "chart",
  "trend",
  "forks",
  "actions",
];

export const ALL_COLUMNS: ColumnId[] = [
  "rank",
  "repo",
  "momentum",
  "stars",
  "trend",
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
