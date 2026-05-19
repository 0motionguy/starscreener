import type { RepoMention } from "@/lib/pipeline/types";
import type { SocialPlatform } from "@/lib/types";

export type MentionSource =
  | "reddit"
  | "hn"
  | "bluesky"
  | "devto"
  | "ph"
  | "twitter"
  | "lobsters"
  | "npm"
  | "huggingface"
  | "arxiv";

export interface MentionItem {
  /** Unique enough across the merged feed. Source + native id. */
  id: string;
  source: MentionSource;
  title: string;
  /** "@handle" or "u/name" or just the username - caller pre-formats. */
  author: string;
  /** Score / likes / votes - whichever the source canonically uses. */
  score: number;
  /** Human label for the primary engagement metric. */
  scoreLabel?: string;
  /** Optional secondary metric: comments / reposts / reactions. */
  secondary?: { label: string; value: number };
  url: string;
  /** ISO 8601 - used for both display and sort order. */
  createdAt: string;
  /** Short explanation for trust/debugging. */
  matchReason?: string;
}

export const MENTION_TABS = [
  "all",
  "reddit",
  "hn",
  "bluesky",
  "twitter",
  "devto",
  "lobsters",
  "ph",
  "npm",
  "huggingface",
  "arxiv",
] as const;

export type MentionTab = (typeof MENTION_TABS)[number];

export const MENTION_SOURCE_LABELS: Record<MentionSource, string> = {
  reddit: "Reddit",
  hn: "HackerNews",
  bluesky: "Bluesky",
  devto: "dev.to",
  ph: "ProductHunt",
  twitter: "Twitter",
  lobsters: "Lobsters",
  npm: "npm",
  huggingface: "HuggingFace",
  arxiv: "arXiv",
};

export const MENTION_TAB_LABELS: Record<MentionTab, string> = {
  all: "All",
  ...MENTION_SOURCE_LABELS,
};

export const MENTION_SOURCE_COLORS: Record<MentionSource, string> = {
  reddit: "#ff4500",
  hn: "#ff6600",
  bluesky: "#0085FF",
  devto: "#0a0a0a",
  ph: "#DA552F",
  twitter: "#1d9bf0",
  lobsters: "#ac130d",
  npm: "#cb3837",
  huggingface: "#ff9d00",
  arxiv: "#a51c30",
};

export const MENTION_SOURCE_BADGE_TEXT: Record<MentionSource, string> = {
  reddit: "R",
  hn: "Y",
  bluesky: "B",
  devto: "DEV",
  ph: "P",
  twitter: "X",
  lobsters: "L",
  npm: "N",
  huggingface: "HF",
  arxiv: "AX",
};

export const MENTION_SOURCE_SHORT_LABEL: Record<MentionSource, string> = {
  reddit: "reddit",
  hn: "hn",
  bluesky: "bsky",
  devto: "dev.to",
  ph: "ph",
  twitter: "x",
  lobsters: "lobsters",
  npm: "npm",
  huggingface: "hf",
  arxiv: "arxiv",
};

/**
 * One-line description for each mention source. Surfaced via `title` on
 * the per-source filter tab so users hover to understand what the tab
 * will show them *before* they click it.
 */
export const MENTION_SOURCE_DESCRIPTIONS: Record<MentionSource, string> = {
  reddit:
    "Reddit — posts in r/programming, r/MachineLearning, and related developer subs from the last 7 days.",
  hn: "HackerNews — Algolia-indexed stories and Show HN submissions that mention this repo (front-page hits highlighted).",
  bluesky:
    "Bluesky — public AT-protocol posts linking the repo, fetched from the jetstream firehose.",
  devto:
    "dev.to — articles tagged with the repo or containing its canonical URL in the last 7 days.",
  ph: "ProductHunt — launches whose website or description points at this repo.",
  twitter:
    "Twitter/X — posts from tracked developer accounts mentioning the repo; scored by unique-author reach.",
  lobsters:
    "Lobsters — stories on lobste.rs that link to or discuss the repo from the last 7 days.",
  npm: "npm — packages published in the registry whose `repository` field points at this repo.",
  huggingface:
    "HuggingFace — models, datasets, and spaces whose card metadata references this repo.",
  arxiv:
    "arXiv — research papers in the recent index whose `linkedRepos` contains this repo (citations).",
};

/** Description shown on the "All" tab so the default view is also self-explaining. */
export const MENTION_ALL_DESCRIPTION =
  "All mentions — every per-source hit merged, newest first.";

// ---------------------------------------------------------------------------
// RepoMention -> MentionItem conversion
// ---------------------------------------------------------------------------

/**
 * Map a persisted-store SocialPlatform to the MentionItem source tag. The
 * render layer uses a narrower vocabulary ("hn" vs "hackernews") and includes
 * synthetic sources ("ph") that don't live in the MentionStore — those stay
 * absent here and continue to be surfaced via their own dedicated props.
 */
const PLATFORM_TO_SOURCE: Partial<Record<SocialPlatform, MentionSource>> = {
  reddit: "reddit",
  hackernews: "hn",
  bluesky: "bluesky",
  devto: "devto",
  twitter: "twitter",
  lobsters: "lobsters",
  npm: "npm",
  huggingface: "huggingface",
  arxiv: "arxiv",
};

/** Per-platform label for the primary engagement metric on a store row. */
const PLATFORM_SCORE_LABEL: Record<MentionSource, string> = {
  reddit: "upvotes",
  hn: "points",
  bluesky: "likes",
  devto: "reactions",
  ph: "votes",
  twitter: "engagement",
  lobsters: "score",
  npm: "downloads/wk",
  huggingface: "downloads",
  arxiv: "citations",
};

/** Render-friendly author handle shaped by source convention. */
function formatAuthor(source: MentionSource, author: string): string {
  const raw = (author ?? "").trim();
  if (!raw) return "—";
  if (source === "reddit") {
    return raw.startsWith("u/") ? raw : `u/${raw}`;
  }
  if (source === "bluesky" || source === "twitter" || source === "devto") {
    return raw.startsWith("@") ? raw : `@${raw.replace(/^@+/, "")}`;
  }
  if (source === "lobsters") {
    return raw.startsWith("~") ? raw : `~${raw.replace(/^~+/, "")}`;
  }
  return raw;
}

/**
 * Convert a persisted `RepoMention` into the render-shaped `MentionItem`
 * consumed by the feed + signal-snapshot components. Returns `null` when the
 * mention's platform has no render-layer source (e.g. GitHub events).
 */
export function toMentionItem(m: RepoMention): MentionItem | null {
  const source = PLATFORM_TO_SOURCE[m.platform];
  if (!source) return null;

  return {
    id: `${source}-${m.id}`,
    source,
    title: m.content,
    author: formatAuthor(source, m.author),
    score: m.engagement,
    scoreLabel: PLATFORM_SCORE_LABEL[source],
    // The store row has a flat engagement count and no per-metric breakdown,
    // so the secondary slot is intentionally left empty. The feed's layout
    // gracefully omits the slot when absent.
    url: m.url,
    createdAt: m.postedAt,
    matchReason: m.matchReason ?? undefined,
  };
}

/**
 * Reverse of `PLATFORM_TO_SOURCE`: map a client-side `MentionTab` onto the
 * `?source=` query param the API expects. Returns `null` when the API
 * should be hit without a filter (i.e. the "all" tab, or a tab whose
 * source isn't persisted in the MentionStore and therefore has no
 * paginated backend — e.g. "ph").
 *
 * The API validates against `SocialPlatform` so the string returned must
 * be a member of that union; we return a plain `string | null` to keep
 * this module free of cross-layer imports beyond the type-only
 * `SocialPlatform` already imported at the top.
 */
export function mentionTabToWirePlatform(tab: MentionTab): SocialPlatform | null {
  switch (tab) {
    case "all":
      return null;
    case "reddit":
      return "reddit";
    case "hn":
      return "hackernews";
    case "bluesky":
      return "bluesky";
    case "twitter":
      return "twitter";
    case "devto":
      return "devto";
    case "lobsters":
      return "lobsters";
    case "npm":
      return "npm";
    case "huggingface":
      return "huggingface";
    case "arxiv":
      return "arxiv";
    case "ph":
      // ProductHunt launches aren't stored in the MentionStore (they live
      // in the launch index and are synthesized into the feed at SSR
      // time), so the paginated endpoint has nothing to serve. Return
      // null and let MentionsLoadMore skip rendering the button on this
      // tab entirely — see its `disabled` check.
      return null;
  }
}
