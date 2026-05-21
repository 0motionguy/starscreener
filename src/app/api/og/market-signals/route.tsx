// GET /api/og/market-signals — Market Signals cockpit share card.
//
// Static headline composition (no data-driven rows). Mirrors the simpler
// signals / agent-commerce fallback pattern: brand wordmark + headline +
// subline + accent strip. The /market-signals page is itself a cockpit
// of 30+ feeds, so the share card stays scoped to the value proposition
// rather than trying to render a live cross-section.

import { ImageResponse } from "next/og";

import { AccentStrip, CardFrame, Wordmark } from "@/lib/og-primitives";
import { OG_CACHE_HEADERS, OG_COLORS } from "@/lib/seo";

export const runtime = "nodejs";

const SOURCES = [
  "GitHub",
  "Hacker News",
  "Reddit",
  "X",
  "Bluesky",
  "ProductHunt",
  "Dev.to",
  "npm",
  "arXiv",
  "Hugging Face",
];

export async function GET() {
  return new ImageResponse(
    (
      <CardFrame>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          <Wordmark fontSize={28} />
          <span
            style={{
              display: "flex",
              fontFamily: "monospace",
              fontSize: 18,
              color: OG_COLORS.textTertiary,
              letterSpacing: "0.06em",
            }}
          >
            /market-signals
          </span>
        </div>

        {/* Hero */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
          <span
            style={{
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              color: OG_COLORS.textPrimary,
            }}
          >
            Market Signals
          </span>
          <span
            style={{
              display: "flex",
              marginTop: 12,
              fontSize: 24,
              color: OG_COLORS.textSecondary,
              maxWidth: 980,
              lineHeight: 1.35,
            }}
          >
            Live cross-source telemetry across 30+ feeds. One cockpit for
            every breakout signal.
          </span>
        </div>

        {/* Source chip row */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            marginTop: 32,
            maxWidth: 1080,
          }}
        >
          {SOURCES.map((source) => (
            <span
              key={source}
              style={{
                display: "flex",
                fontFamily: "monospace",
                fontSize: 18,
                fontWeight: 600,
                color: OG_COLORS.textSecondary,
                padding: "8px 14px",
                border: `1px solid ${OG_COLORS.border}`,
                borderRadius: 4,
                backgroundColor: OG_COLORS.bgSecondary,
                letterSpacing: "0.04em",
              }}
            >
              {source}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            marginTop: "auto",
            fontFamily: "monospace",
            fontSize: 20,
            color: OG_COLORS.textTertiary,
            letterSpacing: "0.04em",
          }}
        >
          <span style={{ display: "flex", color: OG_COLORS.brand, fontWeight: 700 }}>
            trendingrepo.com/market-signals
          </span>
          <span style={{ display: "flex" }}>updated every 30 min</span>
        </div>

        <AccentStrip />
      </CardFrame>
    ),
    { width: 1200, height: 630, headers: OG_CACHE_HEADERS },
  );
}
