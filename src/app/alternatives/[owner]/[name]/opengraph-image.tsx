// Dynamic OG card for /alternatives/[owner]/[name].

import { ImageResponse } from "next/og";

import { AccentStrip, CardFrame, Wordmark } from "@/lib/og-primitives";
import { OG_CACHE_HEADERS, OG_COLORS } from "@/lib/seo";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Open-source alternatives on TrendingRepo";

export default async function Image({
  params,
}: {
  params: Promise<{ owner: string; name: string }>;
}) {
  const { owner, name } = await params;
  const full = `${owner}/${name}`;

  return new ImageResponse(
    (
      <CardFrame>
        <Wordmark />
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 64 }}>
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
            Alternatives
          </div>
          <div
            style={{
              fontSize: 60,
              fontWeight: 800,
              color: OG_COLORS.textPrimary,
              lineHeight: 1.06,
              letterSpacing: "-0.02em",
              maxWidth: 1000,
            }}
          >
            {`Best alternatives to ${full}`}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: OG_COLORS.textSecondary, maxWidth: 940 }}>
            Top open-source options ranked by cross-source momentum
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
          <span style={{ display: "flex" }}>trendingrepo.com/alternatives/{full}</span>
          <span style={{ display: "flex" }}>stars · momentum · mentions</span>
        </div>
        <AccentStrip />
      </CardFrame>
    ),
    { width: 1200, height: 630, headers: OG_CACHE_HEADERS },
  );
}
