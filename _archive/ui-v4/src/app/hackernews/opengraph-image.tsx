// TrendingRepo — /hackernews OG share card (S5.C.3).

import { renderFeedOGImage, FEED_OG_SIZE } from "@/lib/og-feed-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "TrendingRepo — Hacker News signal";
export const size = FEED_OG_SIZE;
export const contentType = "image/png";

export default function HackerNewsOGImage() {
  return renderFeedOGImage({
    alt,
    eyebrow: "HACKER NEWS · YC",
    headline: "Repos breaking on HN",
    sub: "Hacker News front-page + new submissions, ranked by repo signal strength over the last 24 hours.",
    rows: [
      { label: "FRONT-PAGE WINDOW", value: "24h" },
      { label: "POINT THRESHOLD", value: "≥ 50" },
      { label: "REPO MENTIONS", value: "tracked" },
    ],
    routePath: "/hackernews",
    accent: "#FF6600",
  });
}
