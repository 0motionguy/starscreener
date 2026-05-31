// Signal row types — relocated from the archived
// `src/components/signal/SignalTable.tsx`. Consumers in src/lib and
// src/app/api depend on this shape; the rebuild can wire a new visual
// table against the same row contract or replace it entirely.

export type MonoSource =
  | "reddit"
  | "hackernews"
  | "bluesky"
  | "devto"
  | "lobsters"
  | "twitter"
  | "github"
  | "mcp"
  | "skills";

export type SignalBadgeKind =
  | "hot"
  | "rising"
  | "fire"
  | "new"
  | "launch"
  | "funding"
  | "front-page"
  | "linked-repo"
  | "agents"
  | "mcp"
  | "verified";

export type SignalColumn =
  | "rank"
  | "title"
  | "source"
  | "topic"
  | "linkedRepo"
  | "engagement"
  | "comments"
  | "velocity"
  | "age"
  | "signal";

export interface SignalRow {
  /** Stable key for React. Source-prefixed (e.g. "reddit:abc123"). */
  id: string;

  /** Primary line — repo full name OR post title. */
  title: string;
  /** External link (post URL) or internal href (`/repo/...`). */
  href?: string | null;
  /** External target — opens in new tab when true. */
  external?: boolean;

  /** Secondary line under the title — author / subreddit / handle. */
  attribution?: string | null;
  /** Hover excerpt — short post body / top reply. */
  excerpt?: string | null;

  /** Source monogram (only renders when `source` column is requested). */
  source?: MonoSource;

  /** Single topic chip text (Agents · MCP · …). */
  topic?: string | null;

  /** Linked repo full name (`owner/name`) — when present, renders a
   * green LINKED badge + clickable repo path. */
  linkedRepo?: string | null;

  /** Engagement number (likes / score / reactions). */
  engagement?: number;
  /** Display label for the engagement column header — defaults "Engagement". */
  engagementLabel?: string;

  comments?: number;

  /** Pre-categorized velocity from the page's compute step. */
  velocity?: "hot" | "rising" | "steady" | null;

  /** ISO timestamp — converted to "5h" by the row. */
  postedAt?: string | null;

  /** 0–100 signal score. */
  signalScore?: number | null;

  /** Optional inline badges (max 3 enforced visually). */
  badges?: SignalBadgeKind[];

  /** Optional avatar / logo URL for the row. Falls back to a deterministic
   *  monogram tile when missing. */
  logoUrl?: string | null;
}
