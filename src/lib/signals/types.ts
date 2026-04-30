// Shared types used by the cross-source synthesis libs (consensus, volume,
// tag-momentum). Each source builder normalizes its native records into
// SignalItem[] so the synthesis layer doesn't have to special-case eight
// payload shapes.

export type SourceKey =
  | "hn"
  | "github"
  | "x"
  | "reddit"
  | "bluesky"
  | "devto"
  | "claude"
  | "openai";

export interface SignalItem {
  source: SourceKey;
  /** Source-prefixed unique id, e.g. "hn:39812345". */
  id: string;
  title: string;
  /** Outbound URL (story link / tweet permalink / RSS link). Null for some sources. */
  url: string | null;
  /** Posted/published epoch ms. 0 if the source doesn't expose a usable timestamp. */
  postedAtMs: number;
  /**
   * owner/name (lowercased) when the item links to a tracked GitHub repo.
   * Reddit/HN/Bluesky/Dev.to/Lobsters extract this at scrape time; Twitter
   * is per-repo by construction; GH-trending IS a repo so it's set;
   * RSS feeds default to null.
   */
  linkedRepo: string | null;
  /** Free-form topic tags (lowercased). Source-native tags + extracted topics. */
  tags: string[];
  /** Raw engagement number for sorting (points/likes/reactions). */
  engagement: number;
  /** Normalized 0..100 signal strength used for consensus weighting. */
  signalScore: number;
  /** Optional byline shown in feed rows. */
  attribution?: string | null;
}
