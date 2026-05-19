// TrendingRepo — /bluesky OG share card (S5.C.3).

import { renderFeedOGImage, FEED_OG_SIZE } from "@/lib/og-feed-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "TrendingRepo — Bluesky signal";
export const size = FEED_OG_SIZE;
export const contentType = "image/png";

export default function BlueskyOGImage() {
  return renderFeedOGImage({
    alt,
    eyebrow: "BLUESKY · AT-PROTO",
    headline: "Repos buzzing on Bluesky",
    sub: "AT-protocol mentions + reposts, filtered to developer-aligned authors and ranked by 24h velocity.",
    rows: [
      { label: "TRACKED AUTHORS", value: "curated" },
      { label: "VELOCITY WINDOW", value: "24h" },
      { label: "GH-LINKED ONLY", value: "yes" },
    ],
    routePath: "/bluesky",
    accent: "#0085FF",
  });
}
