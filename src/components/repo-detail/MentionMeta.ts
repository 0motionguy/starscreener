export type MentionSource =
  | "reddit"
  | "hn"
  | "bluesky"
  | "devto"
  | "ph"
  | "twitter";

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
  "ph",
] as const;

export type MentionTab = (typeof MENTION_TABS)[number];

export const MENTION_SOURCE_LABELS: Record<MentionSource, string> = {
  reddit: "Reddit",
  hn: "HackerNews",
  bluesky: "Bluesky",
  devto: "dev.to",
  ph: "ProductHunt",
  twitter: "Twitter",
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
};

export const MENTION_SOURCE_BADGE_TEXT: Record<MentionSource, string> = {
  reddit: "R",
  hn: "Y",
  bluesky: "B",
  devto: "DEV",
  ph: "P",
  twitter: "X",
};

export const MENTION_SOURCE_SHORT_LABEL: Record<MentionSource, string> = {
  reddit: "reddit",
  hn: "hn",
  bluesky: "bsky",
  devto: "dev.to",
  ph: "ph",
  twitter: "x",
};
