// TrendingRepo — /digest OG share card (S5.C.3).

import { renderFeedOGImage, FEED_OG_SIZE } from "@/lib/og-feed-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "TrendingRepo — Weekly digest";
export const size = FEED_OG_SIZE;
export const contentType = "image/png";

export default function DigestOGImage() {
  return renderFeedOGImage({
    alt,
    eyebrow: "DIGEST · WEEKLY RECAP",
    headline: "One email. The whole week.",
    sub: "Personalised digest of every repo that hit your alerts in the past 7 days, plus the platform breakouts you missed.",
    rows: [
      { label: "WEEKLY CADENCE", value: "Mondays 08:00" },
      { label: "DAILY OPTION", value: "available" },
      { label: "QUIET HOURS", value: "configurable" },
    ],
    routePath: "/digest",
    accent: "#A855F7",
  });
}
