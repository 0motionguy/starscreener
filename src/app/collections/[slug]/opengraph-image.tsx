// Dynamic OG card for /collections/[slug].

import { ImageResponse } from "next/og";

import { AccentStrip, CardFrame, Wordmark } from "@/lib/og-primitives";
import { OG_CACHE_HEADERS, OG_COLORS } from "@/lib/seo";
import { loadCollection } from "@/lib/collections";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Curated open-source collection on TrendingRepo";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = loadCollection(slug);
  const name = collection?.name ?? "Collection";
  const count = collection?.items.length ?? 0;

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
            Collection
          </div>
          <div
            style={{
              fontSize: 62,
              fontWeight: 800,
              color: OG_COLORS.textPrimary,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              maxWidth: 1000,
            }}
          >
            {`${name}`}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: OG_COLORS.textSecondary, maxWidth: 940 }}>
            {`${count} curated open-source projects, ranked by momentum`}
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
          <span style={{ display: "flex" }}>{`trendingrepo.com/collections/${slug}`}</span>
          <span style={{ display: "flex" }}>cross-source momentum</span>
        </div>
        <AccentStrip />
      </CardFrame>
    ),
    { width: 1200, height: 630, headers: OG_CACHE_HEADERS },
  );
}
