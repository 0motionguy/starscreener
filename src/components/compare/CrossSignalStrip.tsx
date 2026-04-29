"use client";

// Compact cross-signal strip. Translates `countsBySource` (per-platform
// mention totals from the canonical profile) into ChannelDots props so a
// platform with >=1 mention counts as "firing". Keeps the same 5-dot
// vocabulary the rest of the product uses.

import { ChannelDots } from "@/components/cross-signal/ChannelDots";
import type { SocialPlatform } from "@/lib/types";

interface CrossSignalStripProps {
  mentions: Partial<Record<SocialPlatform, number>>;
}

export function CrossSignalStrip({ mentions }: CrossSignalStripProps) {
  const redditCount = mentions.reddit ?? 0;
  const hnCount = mentions.hackernews ?? 0;
  const blueskyCount = mentions.bluesky ?? 0;
  const devtoCount = mentions.devto ?? 0;
  // GitHub is always "active" when we have a profile row — the repo exists
  // in the index. This mirrors how ChannelDots is wired on the detail page
  // (getChannelStatus sets github=true when the repo is tracked).
  const status = {
    github: true,
    reddit: redditCount > 0,
    hn: hnCount > 0,
    bluesky: blueskyCount > 0,
    devto: devtoCount > 0,
  };
  const firing =
    (status.github ? 1 : 0) +
    (status.reddit ? 1 : 0) +
    (status.hn ? 1 : 0) +
    (status.bluesky ? 1 : 0) +
    (status.devto ? 1 : 0);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono uppercase tracking-wider text-text-tertiary">
          Cross-Signal
        </span>
        <span className="text-xs font-mono text-text-tertiary tabular-nums">
          {firing}/5
        </span>
      </div>
      <ChannelDots
        status={status}
        size="md"
        tooltips={{
          github: "Indexed on TrendingRepo",
          reddit: redditCount
            ? `Reddit: ${redditCount} mention(s)`
            : "Reddit: not firing",
          hn: hnCount
            ? `HackerNews: ${hnCount} mention(s)`
            : "HackerNews: not firing",
          bluesky: blueskyCount
            ? `Bluesky: ${blueskyCount} mention(s)`
            : "Bluesky: not firing",
          devto: devtoCount
            ? `dev.to: ${devtoCount} mention(s)`
            : "dev.to: not firing",
        }}
      />
    </div>
  );
}
