// TrendingRepo — /funding OG share card (S5.C.3).

import { renderFeedOGImage, FEED_OG_SIZE } from "@/lib/og-feed-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "TrendingRepo — OSS funding signals";
export const size = FEED_OG_SIZE;
export const contentType = "image/png";

export default function FundingOGImage() {
  return renderFeedOGImage({
    alt,
    eyebrow: "FUNDING · CAPITAL FLOW",
    headline: "Where the money lands",
    sub: "Seed, Series A, and grants flowing into open-source repos — sourced from Crunchbase, GitHub Sponsors, and 8 grant programs.",
    rows: [
      { label: "SIGNAL SOURCES", value: "10+" },
      { label: "REFRESH CADENCE", value: "6h" },
      { label: "GRANT PROGRAMS", value: "tracked" },
    ],
    routePath: "/funding",
    accent: "#10B981",
  });
}
