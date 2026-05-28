// Dynamic OG card for /categories/[slug]. File-convention image route —
// Next auto-injects it into the page's openGraph + twitter metadata, and
// sitemap-pages.xml already references /categories/<slug>/opengraph-image.
// Mirrors the /api/og/default composition (CardFrame + Wordmark +
// AccentStrip) so every share card lands in the same brand frame.

import { ImageResponse } from "next/og";

import { AccentStrip, CardFrame, Wordmark } from "@/lib/og-primitives";
import { OG_CACHE_HEADERS, OG_COLORS } from "@/lib/seo";
import { getCategoryMeta } from "@/lib/categories";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Trending category on TrendingRepo";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = getCategoryMeta(slug);
  const name = meta?.name ?? "Trending";
  const description = meta?.description ?? "Trending open-source projects";

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
              display: "flex",
              fontFamily: "monospace",
              fontSize: 22,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: OG_COLORS.brand,
            }}
          >
            Category
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: OG_COLORS.textPrimary,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              maxWidth: 980,
            }}
          >
            Trending {name}
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
            {description}
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
          <span style={{ display: "flex" }}>trendingrepo.com/categories/{slug}</span>
          <span style={{ display: "flex" }}>ranked by cross-source momentum</span>
        </div>

        <AccentStrip />
      </CardFrame>
    ),
    { width: 1200, height: 630, headers: OG_CACHE_HEADERS },
  );
}
