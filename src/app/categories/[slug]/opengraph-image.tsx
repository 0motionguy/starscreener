// TrendingRepo — Category detail OG image
//
// Shares the Dark Void/Liquid Lava palette with the repo detail card. Shows
// the category name, the top 3 movers inside it, and an average-momentum
// badge at the bottom.

import { ImageResponse } from "next/og";
import { getDerivedRepos } from "@/lib/derived-repos";
import { CATEGORIES } from "@/lib/constants";
import { OG_COLORS } from "@/lib/seo";
import { StarMark } from "@/lib/og-primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "TrendingRepo — Category momentum card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export default async function CategoryOGImage({ params }: RouteParams) {
  const { slug } = await params;
  const category = CATEGORIES.find((c) => c.id === slug);

  if (!category) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: OG_COLORS.bg,
            color: OG_COLORS.textPrimary,
            fontFamily: "sans-serif",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 44,
              fontWeight: 800,
              color: OG_COLORS.brand,
              marginBottom: 24,
            }}
          >
            <StarMark size={44} color={OG_COLORS.brand} />
            <span>TrendingRepo</span>
          </div>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>
            Category not found
          </div>
        </div>
      ),
      size,
    );
  }

  const repos = getDerivedRepos()
    .filter((r) => r.categoryId === slug)
    .sort((a, b) => b.momentumScore - a.momentumScore);
  const top3 = repos.slice(0, 3);
  const avgMomentum =
    repos.length > 0
      ? repos.reduce((acc, r) => acc + r.momentumScore, 0) / repos.length
      : 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: OG_COLORS.bg,
          color: OG_COLORS.textPrimary,
          padding: "56px 72px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          <StarMark size={28} color={OG_COLORS.brand} />
          <span style={{ color: OG_COLORS.textPrimary }}>TrendingRepo</span>
        </div>

        {/* Category name huge */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 36,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 18,
              fontFamily: "monospace",
              color: OG_COLORS.textTertiary,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            Category
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 48,
              fontWeight: 700,
              color: category.color,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              marginTop: 8,
            }}
          >
            {category.name}
          </div>
        </div>

        {/* Top 3 today list */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 40,
            gap: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 18,
              fontFamily: "monospace",
              color: OG_COLORS.textTertiary,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            Top 3 today
          </div>
          {top3.length === 0 ? (
            <div
              style={{
                display: "flex",
                fontSize: 24,
                color: OG_COLORS.textTertiary,
              }}
            >
              No repos yet — check back soon.
            </div>
          ) : (
            top3.map((r, idx) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 20px",
                  borderRadius: 1,
                  backgroundColor: OG_COLORS.bgSecondary,
                  border: `1px solid ${OG_COLORS.border}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                    maxWidth: 820,
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      fontFamily: "monospace",
                      fontSize: 24,
                      color: OG_COLORS.textMuted,
                      fontWeight: 700,
                      width: 36,
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      fontSize: 28,
                      fontWeight: 600,
                      color: OG_COLORS.textPrimary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 640,
                    }}
                  >
                    {r.fullName}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 26,
                    fontWeight: 700,
                    fontFamily: "monospace",
                    color:
                      r.starsDelta24h >= 0 ? OG_COLORS.brand : OG_COLORS.down,
                  }}
                >
                  <span>
                    {r.starsDelta24h >= 0 ? "+" : ""}
                    {formatCount(r.starsDelta24h)}
                  </span>
                  <StarMark
                    size={22}
                    color={
                      r.starsDelta24h >= 0 ? OG_COLORS.brand : OG_COLORS.down
                    }
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Avg momentum badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: "auto",
            padding: "12px 22px",
            borderRadius: 9999,
            alignSelf: "flex-start",
            backgroundColor: OG_COLORS.bgSecondary,
            border: `1px solid ${OG_COLORS.border}`,
          }}
        >
          <span
            style={{
              display: "flex",
              fontSize: 16,
              fontFamily: "monospace",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: OG_COLORS.textTertiary,
            }}
          >
            Avg momentum
          </span>
          <span
            style={{
              display: "flex",
              fontSize: 22,
              fontFamily: "monospace",
              fontWeight: 700,
              color: OG_COLORS.brand,
            }}
          >
            {avgMomentum.toFixed(1)}
          </span>
          <span
            style={{
              display: "flex",
              fontSize: 16,
              fontFamily: "monospace",
              color: OG_COLORS.textMuted,
            }}
          >
            · {repos.length} repos
          </span>
        </div>

        {/* Accent strip */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 8,
            backgroundColor: category.color,
            display: "flex",
          }}
        />
      </div>
    ),
    size,
  );
}

function formatCount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(n / 1_000).toLocaleString("en-US")}k`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}
