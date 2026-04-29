// /top10 — shared types
//
// One normalized item shape across all 8 categories so the row + share-card
// renderers don't need a per-category branch. Builders in builders.ts adapt
// each upstream reader (Repo, HfModelTrending, EcosystemLeaderboardItem,
// HnStory, FundingSignal, ...) into this shape.

export const TOP10_CATEGORIES = [
  "repos",
  "llms",
  "agents",
  "mcps",
  "skills",
  "movers",
  "news",
  "funding",
] as const;

export type Top10Category = (typeof TOP10_CATEGORIES)[number];

export const TOP10_WINDOWS = ["24h", "7d", "30d", "ytd"] as const;
export type Top10Window = (typeof TOP10_WINDOWS)[number];

export const TOP10_METRICS = [
  "cross-signal",
  "stars",
  "mentions",
  "velocity",
] as const;
export type Top10Metric = (typeof TOP10_METRICS)[number];

export const TOP10_THEMES = ["dark", "light", "mono"] as const;
export type Top10Theme = (typeof TOP10_THEMES)[number];

export type Top10Badge = "FIRING_5" | "FIRING_4" | "FIRING_3" | "NEW" | "HOT";

/**
 * Lightweight Repo subset shipped to the client so REPOS / AGENTS / MOVERS
 * can re-rank against any window + metric without a server round-trip. Top
 * 80 of these is ~30 KB serialized — cheaper than pre-baking 12 bundles.
 */
export interface RepoSliceLite {
  fullName: string;
  name: string;
  owner: string;
  description: string;
  stars: number;
  starsDelta24h: number;
  starsDelta7d: number;
  starsDelta30d: number;
  starsDelta24hMissing: boolean;
  starsDelta7dMissing: boolean;
  starsDelta30dMissing: boolean;
  trendScore24h?: number;
  trendScore7d?: number;
  trendScore30d?: number;
  crossSignalScore: number;
  channelsFiring: number;
  momentumScore: number;
  movementStatus:
    | "hot"
    | "breakout"
    | "quiet_killer"
    | "rising"
    | "stable"
    | "cooling"
    | "declining";
  sparklineData: number[];
  mentionCount24h: number;
  archived: boolean;
  deleted: boolean;
  isAgent: boolean;
}

export interface Top10Item {
  rank: number;
  /** Stable id, e.g. "anthropics/claude-code", "anthropic/claude-3.5-sonnet". */
  slug: string;
  /** Display name (right of the slash for repos, full name otherwise). */
  title: string;
  /** Optional owner segment, e.g. "anthropics" — repo-style items only. */
  owner?: string;
  description: string;
  /** Single letter for the avatar tile. */
  avatarLetter: string;
  /** [from, to] hex stops for the avatar gradient. */
  avatarGradient: [string, string];
  /** Normalized to 0–5 for display. */
  score: number;
  /** Signed % vs the active window. Undefined when window doesn't apply. */
  deltaPct?: number;
  /** 7–30 daily numbers; empty for sources without per-item series. */
  sparkline?: number[];
  badges: Top10Badge[];
  /** Detail link — e.g. /repo/owner/name, /huggingface/<id>, source URL for news. */
  href: string;
}

export interface Top10MetaStats {
  totalMovement: string;
  totalMovementSub?: string;
  meanScore: string;
  meanScoreSub?: string;
  hottest: string;
  hottestSub?: string;
  coldest: string | null;
  coldestSub?: string;
}

export interface Top10Bundle {
  /** Top 10 fully normalized items for the active category. */
  items: Top10Item[];
  /** Aggregated stats strip displayed under the ranking. */
  meta: Top10MetaStats;
  /** Which windows the underlying source supports. Others are disabled in UI. */
  supportedWindows: Top10Window[];
  /** Window that produced this snapshot (server default). */
  window: Top10Window;
}

export type Top10Payload = Record<Top10Category, Top10Bundle>;

/**
 * Static labels + tab-bar emoji glyphs. Centralised so CategoryTabs and the
 * MoreLists renderer agree on the same surface text without prop-drilling.
 */
export interface CategoryMeta {
  id: Top10Category;
  label: string;
  emoji: string;
  /** Window that the tab defaults to when first opened. */
  defaultWindow: Top10Window;
  /** Sort/metric primary used by the share card. */
  defaultMetric: Top10Metric;
}

export const CATEGORY_META: Record<Top10Category, CategoryMeta> = {
  repos: {
    id: "repos",
    label: "Repos",
    emoji: "★",
    defaultWindow: "7d",
    defaultMetric: "cross-signal",
  },
  llms: {
    id: "llms",
    label: "LLMs",
    emoji: "◎",
    defaultWindow: "7d",
    defaultMetric: "velocity",
  },
  agents: {
    id: "agents",
    label: "Agents",
    emoji: "◆",
    defaultWindow: "7d",
    defaultMetric: "cross-signal",
  },
  mcps: {
    id: "mcps",
    label: "MCPs",
    emoji: "▲",
    defaultWindow: "7d",
    defaultMetric: "velocity",
  },
  skills: {
    id: "skills",
    label: "Skills",
    emoji: "✦",
    defaultWindow: "7d",
    defaultMetric: "velocity",
  },
  movers: {
    id: "movers",
    label: "Movers",
    emoji: "⚡",
    defaultWindow: "24h",
    defaultMetric: "velocity",
  },
  news: {
    id: "news",
    label: "News",
    emoji: "■",
    defaultWindow: "24h",
    defaultMetric: "mentions",
  },
  funding: {
    id: "funding",
    label: "Funding",
    emoji: "◉",
    defaultWindow: "7d",
    defaultMetric: "stars",
  },
};
