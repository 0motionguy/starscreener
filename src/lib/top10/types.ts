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

// Theme registry now lives in themes.ts (single source of truth shared with
// the OG renderer). We re-export the id union here so existing call sites
// that import `Top10Theme` from types.ts keep working unchanged.
export { TOP10_THEME_IDS as TOP10_THEMES } from "./themes";
export type { Top10ThemeId as Top10Theme } from "./themes";

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
  /** Plain-English description shown in tooltips + onboarding. Targets a
   *  non-technical reader (the community share-tool audience). */
  blurb: string;
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
    blurb: "GitHub repos with the strongest cross-platform buzz this week.",
    defaultWindow: "7d",
    defaultMetric: "cross-signal",
  },
  llms: {
    id: "llms",
    label: "LLMs",
    emoji: "◎",
    blurb: "AI models trending on Hugging Face right now.",
    defaultWindow: "7d",
    defaultMetric: "velocity",
  },
  agents: {
    id: "agents",
    label: "Agents",
    emoji: "◆",
    blurb: "Autonomous AI agents and frameworks people are starring.",
    defaultWindow: "7d",
    defaultMetric: "cross-signal",
  },
  mcps: {
    id: "mcps",
    label: "MCPs",
    emoji: "▲",
    blurb: "Model Context Protocol servers shipping the most.",
    defaultWindow: "7d",
    defaultMetric: "velocity",
  },
  skills: {
    id: "skills",
    label: "Skills",
    emoji: "✦",
    blurb: "Claude Skills and prompt packs everyone's installing.",
    defaultWindow: "7d",
    defaultMetric: "velocity",
  },
  movers: {
    id: "movers",
    label: "Biggest jumps",
    emoji: "⚡",
    blurb: "Repos with the biggest 24-hour star jumps.",
    defaultWindow: "24h",
    defaultMetric: "velocity",
  },
  news: {
    id: "news",
    label: "News",
    emoji: "■",
    blurb: "Stories trending on Hacker News, Bluesky, dev.to, Lobsters, and ProductHunt.",
    defaultWindow: "24h",
    defaultMetric: "mentions",
  },
  funding: {
    id: "funding",
    label: "Funding",
    emoji: "◉",
    blurb: "Biggest AI funding rounds and SEC filings this week.",
    defaultWindow: "7d",
    defaultMetric: "stars",
  },
};

// ---------------------------------------------------------------------------
// Friendly label maps — the share-tool audience is creators, not data folks.
// "CROSS-SIGNAL" / "VELOCITY" / "MENTIONS" are internal jargon; these maps
// replace them in app chrome. The share-card image keeps internal terms
// because that's brand identity (mono uppercase looks intentional there).
// ---------------------------------------------------------------------------

export const METRIC_FRIENDLY_LABEL: Record<Top10Metric, string> = {
  "cross-signal": "Smart score",
  stars: "Stars",
  mentions: "Buzz",
  velocity: "Trending",
};

export const METRIC_FRIENDLY_BLURB: Record<Top10Metric, string> = {
  "cross-signal":
    "Combines stars, mentions, and trending speed into one signal. Default ranking.",
  stars: "Total GitHub stars in the time range.",
  mentions: "How often it's mentioned across HN, Reddit, Bluesky, dev.to.",
  velocity: "How fast it's gaining attention right now.",
};

export const WINDOW_FRIENDLY_LABEL: Record<Top10Window, string> = {
  "24h": "24h",
  "7d": "7 days",
  "30d": "30 days",
  ytd: "Year",
};

// Theme labels live alongside palette colors in src/lib/top10/themes.ts —
// the single source of truth shared by the OG renderer and the on-page
// ThemePicker. Read TOP10_THEMES[id].label / .blurb when surfacing copy.
