// GET /api/og/agent-commerce — Branded share card for /agent-commerce.
//
// Static headline composition (no data-driven rows) — the goal is a
// consistent unfurl, not a live snapshot. Mirrors the simpler tier-list
// fallback pattern: brand wordmark + headline + subline + accent strip.

import { ImageResponse } from "next/og";

import { AccentStrip, CardFrame, Wordmark } from "@/lib/og-primitives";
import { OG_CACHE_HEADERS, OG_COLORS } from "@/lib/seo";

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
            Agent Commerce
          </div>
          <div
            style={{
              fontSize: 22,
              color: OG_COLORS.textTertiary,
              maxWidth: 920,
            }}
          >
            On-chain x402 + AI agent commerce trackers — Base, Solana, Dune protocols ranked by 24h volume.
          </div>
        </div>
        <AccentStrip />
      </CardFrame>
    ),
    { width: 1200, height: 630, headers: OG_CACHE_HEADERS },
  );
}
