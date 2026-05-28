// Dynamic OG card for /best/[topic]. File-convention image route — Next
// auto-injects it into the page's openGraph + twitter metadata. Mirrors the
// /api/og/default composition for a consistent brand frame.

import { ImageResponse } from "next/og";

import { AccentStrip, CardFrame, Wordmark } from "@/lib/og-primitives";
import { OG_CACHE_HEADERS, OG_COLORS } from "@/lib/seo";
import { getBestTopic } from "@/lib/best-topics";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Best open-source projects on TrendingRepo";

export default async function Image({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  const t = getBestTopic(topic);
  const title = t?.title ?? "Best open-source projects";
  const blurb = t?.blurb ?? "ranked by cross-source momentum";

  return new ImageResponse(
    (
      <CardFrame>
        <Wordmark />
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 56 }}>
          <div
            style={{
              display: "flex",
              fontFamily: "monospace",
              fontSize: 22,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: OG_COLORS.brand,
            }}
          >
            Best of · Open source
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: OG_COLORS.textPrimary,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              color: OG_COLORS.textSecondary,
              maxWidth: 940,
              lineHeight: 1.35,
            }}
          >
            {blurb}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "auto",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            fontFamily: "monospace",
            fontSize: 20,
            color: OG_COLORS.textTertiary,
            letterSpacing: "0.04em",
          }}
        >
          <span style={{ display: "flex" }}>trendingrepo.com/best/{topic}</span>
          <span style={{ display: "flex" }}>ranked by cross-source momentum</span>
        </div>

        <AccentStrip />
      </CardFrame>
    ),
    { width: 1200, height: 630, headers: OG_CACHE_HEADERS },
  );
}
