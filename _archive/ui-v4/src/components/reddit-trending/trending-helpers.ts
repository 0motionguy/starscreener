// Pure helpers shared by AllTrendingTabs and the lazy-loaded panel chunks
// (PostListPanel, SubredditGroupPanel). Extracted in AGN-455 so panel
// components don't have to re-import from a "use client"-tagged sibling.

import type { BaselinePillSize } from "@/components/reddit/BaselinePill";

export type PostTier = "hyperviral" | "breakout" | "above-avg" | "baseline";

export interface TierClasses {
  row: string;
  title: string;
  baselinePillSize: BaselinePillSize;
  contentOpacity: string;
}

export interface VelocityStats {
  p50: number;
  p90: number;
}

export function getPostTier(ratio: number | null | undefined): PostTier {
  if (ratio == null) return "baseline";
  if (ratio >= 100) return "hyperviral";
  if (ratio >= 10) return "breakout";
  if (ratio >= 1) return "above-avg";
  return "baseline";
}

export function tierClasses(tier: PostTier): TierClasses {
  switch (tier) {
    case "hyperviral":
      return {
        row: "border-l-4 border-l-[#ff6600] bg-gradient-to-br from-bg-card via-bg-card to-[#ff6600]/[0.06]",
        title: "text-lg sm:text-xl font-bold",
        baselinePillSize: "lg",
        contentOpacity: "",
      };
    case "breakout":
      return {
        row: "border-l-2 border-l-[#ff4500]/70",
        title: "text-base sm:text-lg font-bold",
        baselinePillSize: "md",
        contentOpacity: "",
      };
    case "above-avg":
      return {
        row: "",
        title: "text-base font-semibold",
        baselinePillSize: "sm",
        contentOpacity: "",
      };
    case "baseline":
      return {
        row: "opacity-75 hover:opacity-100",
        title: "text-sm font-semibold",
        baselinePillSize: "sm",
        contentOpacity: "",
      };
  }
}

export function tierClassesCompact(tier: PostTier): TierClasses {
  switch (tier) {
    case "hyperviral":
      return {
        row: "border-l-4 border-l-[#ff6600] bg-gradient-to-br from-bg-card via-bg-card to-[#ff6600]/[0.06]",
        title: "text-sm font-bold",
        baselinePillSize: "md",
        contentOpacity: "",
      };
    case "breakout":
      return {
        row: "border-l-2 border-l-[#ff4500]/70",
        title: "text-sm font-bold",
        baselinePillSize: "sm",
        contentOpacity: "",
      };
    case "above-avg":
      return {
        row: "",
        title: "text-sm font-semibold",
        baselinePillSize: "sm",
        contentOpacity: "",
      };
    case "baseline":
      return {
        row: "opacity-75 hover:opacity-100",
        title: "text-xs font-semibold",
        baselinePillSize: "sm",
        contentOpacity: "",
      };
  }
}

export function subredditColorHash(seed: string): string {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  const hue = (Math.round(sum / 30) * 30) % 360;
  return `hsl(${hue}, 60%, 65%)`;
}

export function formatPostAge(hours: number | undefined): string {
  if (hours == null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  return `${Math.round(days)}d`;
}
