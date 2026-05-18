// TrendingRepo — /reddit OG share card (S5.C.3).

import { renderFeedOGImage, FEED_OG_SIZE } from "@/lib/og-feed-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "TrendingRepo — Reddit dev velocity";
export const size = FEED_OG_SIZE;
export const contentType = "image/png";

export default function RedditOGImage() {
  return renderFeedOGImage({
    alt,
    eyebrow: "REDDIT · DEV-FORUMS",
    headline: "Reddit dev velocity",
    sub: "Sub-by-sub upvote velocity across /r/programming, /r/MachineLearning, /r/rust, /r/golang, and 12 more.",
    rows: [
      { label: "TRACKED SUBS", value: "16" },
      { label: "VELOCITY WINDOW", value: "6h" },
      { label: "ANTI-BOT FILTER", value: "yes" },
    ],
    routePath: "/reddit",
    accent: "#FF4500",
  });
}
