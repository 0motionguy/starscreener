// TrendingRepo — Homepage OG image
//
// 1200×630 card advertising the terminal. Renders the wordmark, tagline, a
// 3×2 grid of the top six repos by momentum, and a live-stats strip. Uses
// literal hex values from the Dark Void + Liquid Lava palette since CSS
// tokens don't resolve inside ImageResponse.

import { ImageResponse } from "next/og";
import { getTopMoversByDelta24h } from "@/lib/trending";
import { getDerivedRepoCount } from "@/lib/derived-repos";
import { OG_COLORS } from "@/lib/seo";
import { Dot, StarMark } from "@/lib/og-primitives";

export const runtime = "nodejs";
export const alt = "TrendingRepo — The trend map for open source";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function HomeOGImage() {
  // Read from committed trending + deltas JSON instead of the in-memory
  // pipeline — the latter returns zeros on cold Vercel Lambdas. See
  // /api/pipeline/status route header for the same Phase-3 boundary
  // pattern.
  const top = getTopMoversByDelta24h(6);
  const totalTracked = getDerivedRepoCount();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: OG_COLORS.bg,
          padding: "60px 80px",
          fontFamily: "sans-serif",
          color: OG_COLORS.textPrimary,
          position: "relative",
        }}
      >
        {/* Mono eyebrow — V2 operator label */}
        <div
          style={{
            display: "flex",
            fontSize: 16,
            fontFamily: "monospace",
            color: OG_COLORS.textMuted,
            letterSpacing: "0.20em",
            textTransform: "uppercase",
            marginBottom: 32,
          }}
        >
          {"// trendingrepo · live · 04.27"}
        </div>

        {/* Wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: "-0.035em",
            lineHeight: 1,
          }}
        >
          <StarMark size={72} color={OG_COLORS.brand} />
          <span style={{ color: OG_COLORS.textPrimary }}>TrendingRepo</span>
        </div>

        {/* Headline — display weight 300 with dim/bright pattern */}
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 64,
            fontWeight: 300,
            letterSpacing: "-0.035em",
            lineHeight: 1,
          }}
        >
          <span style={{ color: OG_COLORS.textMuted }}>the&nbsp;</span>
          <span style={{ color: OG_COLORS.textPrimary }}>trend map</span>
          <span style={{ color: OG_COLORS.textMuted }}>&nbsp;for open source</span>
        </div>

        {/* 3x2 repo grid */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            marginTop: 48,
            gap: 16,
            width: "100%",
          }}
        >
          {top.slice(0, 6).map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: 336,
                padding: "16px 20px",
                borderRadius: 1,
                backgroundColor: OG_COLORS.bgSecondary,
                border: `1px solid ${OG_COLORS.border}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  maxWidth: 220,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    fontSize: 18,
                    fontWeight: 600,
                    color: OG_COLORS.textPrimary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.fullName}
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: 13,
                    color: OG_COLORS.textTertiary,
                    marginTop: 4,
                  }}
                >
                  {r.language ?? "—"}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 18,
                  fontWeight: 700,
                  color: OG_COLORS.brand,
                  fontFamily: "monospace",
                }}
              >
                <span>+{compact(r.starsDelta24h)}</span>
                <StarMark size={16} color={OG_COLORS.brand} />
              </div>
            </div>
          ))}
        </div>

        {/* Stats line */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: "auto",
            fontSize: 22,
            fontFamily: "monospace",
            color: OG_COLORS.textTertiary,
            letterSpacing: 0.5,
          }}
        >
          <Dot size={16} color={OG_COLORS.up} />
          <span style={{ color: OG_COLORS.up, marginLeft: 8 }}>Live</span>
          <span style={{ color: OG_COLORS.textMuted, margin: "0 16px" }}>
            ·
          </span>
          <span style={{ color: OG_COLORS.textSecondary }}>
            {totalTracked}+ repos tracked
          </span>
          <span style={{ color: OG_COLORS.textMuted, margin: "0 16px" }}>
            ·
          </span>
          <span style={{ color: OG_COLORS.textSecondary }}>Updated ~20m</span>
        </div>

        {/* Bottom orange accent strip */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 8,
            backgroundColor: OG_COLORS.brand,
            display: "flex",
          }}
        />
      </div>
    ),
    size,
  );
}

function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}
