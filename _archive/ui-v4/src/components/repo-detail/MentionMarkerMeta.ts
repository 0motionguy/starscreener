export type MentionPlatform =
  | "hn"
  | "reddit"
  | "bluesky"
  | "devto"
  | "ph"
  | "twitter";

export interface MentionMarker {
  id: string;
  platform: MentionPlatform;
  platformLabel: string;
  color: string;
  stroke?: string;
  xValue: number;
  title: string;
  author: string;
  score: number;
  scoreLabel: string;
  url: string;
}

export const MENTION_PLATFORM_LABELS: Record<MentionPlatform, string> = {
  hn: "Hacker News",
  reddit: "Reddit",
  bluesky: "Bluesky",
  devto: "dev.to",
  ph: "ProductHunt",
  twitter: "Twitter",
};

export const MENTION_PLATFORM_COLORS: Record<MentionPlatform, string> = {
  hn: "#ff6600",
  reddit: "#ff4500",
  bluesky: "#0085FF",
  devto: "#0a0a0a",
  ph: "#DA552F",
  twitter: "#1d9bf0",
};
