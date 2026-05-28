// GET /api/og/compare/<owner>/<name>/vs/<owner>/<name> — comparison OG card.
//
// Served as an API route (not a file-convention opengraph-image) because the
// page lives under a catch-all segment (/compare/[...slug]), and Next forbids
// a static opengraph-image child of a catch-all. The compare page's
// generateMetadata points og:image + twitter:image here.

import { ImageResponse } from "next/og";

import { AccentStrip, CardFrame, Wordmark } from "@/lib/og-primitives";
import { OG_CACHE_HEADERS, OG_COLORS } from "@/lib/seo";
import { parseComparePath } from "@/lib/compare-pairs";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params;
  const pair = parseComparePath(slug);
  const a = pair?.a ?? "Repo A";
  const b = pair?.b ?? "Repo B";

  return new ImageResponse(
    (
      <CardFrame>
        <Wordmark />
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 64 }}>
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
            Head-to-head
          </div>
          <div
            style={{
              fontSize: 58,
              fontWeight: 800,
              color: OG_COLORS.textPrimary,
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              maxWidth: 1000,
            }}
          >
            {a}
          </div>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: OG_COLORS.brand }}>vs</div>
          <div
            style={{
              fontSize: 58,
              fontWeight: 800,
              color: OG_COLORS.textPrimary,
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              maxWidth: 1000,
            }}
          >
            {b}
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
          <span style={{ display: "flex" }}>stars · momentum · mentions</span>
        </div>
        <AccentStrip />
      </CardFrame>
    ),
    { width: 1200, height: 630, headers: OG_CACHE_HEADERS },
  );
}
