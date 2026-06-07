// GET /api/og/default — Generic brand share card.
//
// Used as the homepage / fallback OG image when a more specific endpoint
// hasn't been built (e.g. /pricing, marketing pages). Static composition —
// no data-driven rows — mirrors the simpler signals / agent-commerce
// pattern so unfurls are crawl-instant even on cold edges.
//
// Twitter `summary_large_image` size (1200×630) so every X / LinkedIn /
// Slack preview lands in the same aspect.

import { ImageResponse } from "next/og";

import { AccentStrip, CardFrame, Wordmark } from "@/lib/og-primitives";
import { OG_CACHE_HEADERS, OG_COLORS, SITE_TAGLINE } from "@/lib/seo";

export const runtime = "nodejs";

export async function GET() {
  return new ImageResponse(
    (
      <CardFrame>
        <Wordmark />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            marginTop: 56,
          }}
        >
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              color: OG_COLORS.textPrimary,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              maxWidth: 980,
            }}
          >
            {SITE_TAGLINE}
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
            Real-time discovery across GitHub, Hacker News, X,
            Bluesky, ProductHunt, Dev.to and 23 more — one live terminal
            for every signal.
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
          <span style={{ display: "flex" }}>trendingrepo.com</span>
          <span style={{ display: "flex" }}>updated every 30 min</span>
        </div>

        <AccentStrip />
      </CardFrame>
    ),
    { width: 1200, height: 630, headers: OG_CACHE_HEADERS },
  );
}
