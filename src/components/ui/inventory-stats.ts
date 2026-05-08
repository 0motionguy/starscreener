import type { InventoryStat } from "./InventoryBand";

export function buildTwitterInventoryStats(opts: {
  totalMentions24h: number;
  reposEverSeen: number;
  freshNow: number;
  staleCount: number;
}): InventoryStat[] {
  return [
    {
      label: "Tweets observed",
      value: opts.totalMentions24h,
      sub: "last 24h",
      tone: "default",
    },
    {
      label: "Repos with buzz",
      value: opts.reposEverSeen,
      sub: "ever",
      tone: "default",
    },
    {
      label: "Fresh now",
      value: opts.freshNow,
      sub: "<24h",
      tone: "fresh",
    },
    {
      label: "Stale",
      value: opts.staleCount,
      sub: "24h-7d",
      tone: "stale",
      href: "#stale-section",
    },
  ];
}

export function buildRedditInventoryStats(opts: {
  postsCollected: number;
  subredditsScanned: number;
  postsWithEngagement: number;
  postsZeroEngagement: number;
}): InventoryStat[] {
  return [
    {
      label: "Posts collected",
      value: opts.postsCollected,
      sub: "last scrape",
      tone: "default",
    },
    {
      label: "Subs scanned",
      value: opts.subredditsScanned,
      tone: "default",
    },
    {
      label: "With engagement",
      value: opts.postsWithEngagement,
      sub: "score>0 or comments>0",
      tone: "fresh",
    },
    {
      label: "Zero-engagement",
      value: opts.postsZeroEngagement,
      sub: "RSS-fallback artifacts",
      tone: "stale",
      href: "#zero-engagement-section",
    },
  ];
}
