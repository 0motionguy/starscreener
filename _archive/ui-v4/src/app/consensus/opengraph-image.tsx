// TrendingRepo — /consensus OG share card (S5.C.3).

import { renderFeedOGImage, FEED_OG_SIZE } from "@/lib/og-feed-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "TrendingRepo — Consensus analyst";
export const size = FEED_OG_SIZE;
export const contentType = "image/png";

export default function ConsensusOGImage() {
  return renderFeedOGImage({
    alt,
    eyebrow: "CONSENSUS · MULTI-MODEL",
    headline: "Three models. One verdict.",
    sub: "Top breakout repos analysed by Claude, GPT-4o, and Kimi K2 — independent reads merged into a consensus score with confidence interval.",
    rows: [
      { label: "MODELS RUN", value: "3 per repo" },
      { label: "REFRESH CADENCE", value: "hourly" },
      { label: "AUDIT TRAIL", value: "open" },
    ],
    routePath: "/consensus",
    accent: "#F472B6",
  });
}
