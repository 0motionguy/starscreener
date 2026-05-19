import { ImageResponse } from "next/og";
import { CardFrame, Wordmark, AccentStrip } from "@/lib/og-primitives";
import { OG_CACHE_HEADERS, OG_COLORS } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const alt = "TrendingRepo — Builder tools";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function ToolsOGImage() {
  return new ImageResponse(
    (
      <CardFrame>
        <Wordmark />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            marginTop: 48,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: OG_COLORS.textPrimary,
              lineHeight: 1.05,
            }}
          >
            Builder tools
          </div>
          <div
            style={{
              fontSize: 22,
              color: OG_COLORS.textTertiary,
              maxWidth: 920,
            }}
          >
            Star history, revenue estimator, treemap, and more — all powered by
            the TrendingRepo signal layer.
          </div>
        </div>
        <AccentStrip />
      </CardFrame>
    ),
    { ...size, headers: OG_CACHE_HEADERS },
  );
}
