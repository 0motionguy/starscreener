// Shared channel constants for the /mindshare bubble map.
//
// Lives outside MindShareCanvas.tsx ("use client") because the server page
// also imports these — when CHANNELS is exported from a "use client"
// module, the RSC bundler strips the array's prototype methods (.reduce,
// .map etc.) when handed across the boundary, throwing a TypeError at
// render time. Pure data + types → safe for either side.

import type { PackResult } from "@/lib/bubble-pack";

export const CHANNELS = ["github", "reddit", "hn", "bluesky", "devto"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_COLORS: Record<Channel, string> = {
  github: "#e5e7eb",
  reddit: "#ff4500",
  hn: "#f59e0b",
  bluesky: "#3b82f6",
  devto: "#22c55e",
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  github: "GitHub",
  reddit: "Reddit",
  hn: "Hacker News",
  bluesky: "Bluesky",
  devto: "dev.to",
};

export interface BubbleRow {
  id: string;
  fullName: string;
  shortName: string;
  owner: string;
  name: string;
  score: number;
  /** Per-channel firing booleans from cross-signal scoring. */
  firing: Record<Channel, boolean>;
  /** Per-channel 24h mention counts — drives arc length proportions. */
  shares: Record<Channel, number>;
  /** Sum of `shares` across channels — pre-computed for tooltip + arc math. */
  totalShare: number;
  pack: PackResult;
}
