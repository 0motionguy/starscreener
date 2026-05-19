// TrendingRepo — /twitter OG share card (S5.C.3).

import { renderFeedOGImage, FEED_OG_SIZE } from "@/lib/og-feed-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "TrendingRepo — Repos trending on X";
export const size = FEED_OG_SIZE;
export const contentType = "image/png";

export default function TwitterOGImage() {
  return renderFeedOGImage({
    alt,
    eyebrow: "X · TWITTER",
    headline: "Repos trending on X",
    sub: "Real X/Twitter mentions, ranked by engagement over the last 24 hours.",
    rows: [
      { label: "TWEETS · 24h", value: "live" },
      { label: "TOP KOLs", value: "by engagement" },
      { label: "MOMENTUM", value: "x-source scored" },
    ],
    routePath: "/twitter",
    accent: "#7AA7FF",
  });
}
