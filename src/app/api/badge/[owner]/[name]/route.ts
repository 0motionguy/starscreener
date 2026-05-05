// /api/badge/[owner]/[name] — embeddable "Trending on TrendingRepo" SVG badge
//
// Designed for README embeds:
//   ![TrendingRepo](https://trendingrepo.com/api/badge/{owner}/{name}.svg)
//
// The route also accepts no-extension form for plain SVG response. Cache is
// short (5 min) so the rank reflects actual trending state without flapping.
//
// AGN-949 [SAM-08].

import { NextRequest, NextResponse } from "next/server";

import { CATEGORIES } from "@/lib/constants";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { refreshTrendingFromStore } from "@/lib/trending";

export const runtime = "nodejs";
export const revalidate = 300;

interface BadgeStyle {
  bg: string;
  fg: string;
  labelBg: string;
}

const STYLES = {
  default: { bg: "#0a0a0f", fg: "#f0f0f0", labelBg: "#1c1c20" },
  amber: { bg: "#1c1c20", fg: "#f59e0b", labelBg: "#0a0a0f" },
  success: { bg: "#0a0a0f", fg: "#22c55e", labelBg: "#1c1c20" },
} as const;
const FALLBACK_CATEGORY_COLOR = "#2563eb";
const LARGE_BADGE_HEIGHT = 24;
const SMALL_BADGE_HEIGHT = 20;

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function badgeText(
  rank: number | null,
  score: number | null,
  includeRank: boolean,
): string {
  if (!includeRank) return "trending";
  if (rank !== null && rank > 0 && rank <= 100) return `#${rank} trending`;
  if (score !== null && score > 0) return `${Math.round(score)} score`;
  return "tracked";
}

function buildSvg(
  label: string,
  value: string,
  style: BadgeStyle,
  categoryColor: string,
  size: "small" | "large",
): string {
  // Shields.io-style two-segment badge. Width is computed from text length so
  // the badge looks tight regardless of repo name.
  const height = size === "large" ? LARGE_BADGE_HEIGHT : SMALL_BADGE_HEIGHT;
  const fontSize = size === "large" ? 12 : 11;
  const y = size === "large" ? 16 : 14;
  const radius = size === "large" ? 4 : 3;
  const pad = size === "large" ? 20 : 14;
  const minW = size === "large" ? 86 : 70;
  const labelChars = label.length;
  const valueChars = value.length;
  const labelW = Math.max(minW, labelChars * 7 + pad);
  const valueW = Math.max(minW, valueChars * 7 + pad);
  const totalW = labelW + valueW;
  const labelEsc = escapeXml(label);
  const valueEsc = escapeXml(value);
  const catColorEsc = escapeXml(categoryColor);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${height}" role="img" aria-label="${labelEsc}: ${valueEsc}">
  <title>${labelEsc}: ${valueEsc}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalW}" height="${height}" rx="${radius}" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="${height}" fill="${style.labelBg}"/>
    <rect x="${labelW}" width="${valueW}" height="${height}" fill="${style.bg}"/>
    <rect x="${labelW}" width="3" height="${height}" fill="${catColorEsc}"/>
    <rect width="${totalW}" height="${height}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="${fontSize}">
    <text x="${labelW / 2}" y="${y}" fill="#fff">${labelEsc}</text>
    <text x="${labelW + valueW / 2}" y="${y}" fill="${style.fg}">${valueEsc}</text>
  </g>
</svg>`;
}

interface BadgeRouteContext {
  params: Promise<{ owner: string; name: string }>;
}

export async function GET(request: NextRequest, ctx: BadgeRouteContext): Promise<NextResponse> {
  const { owner, name } = await ctx.params;
  const cleanName = name.replace(/\.svg$/, "");
  const fullName = `${owner}/${cleanName}`;
  const url = new URL(request.url);
  const styleKey = (url.searchParams.get("style") ?? "default") as keyof typeof STYLES;
  const size = url.searchParams.get("size") === "large" ? "large" : "small";
  const includeRank = url.searchParams.get("rank") !== "0";
  const style = STYLES[styleKey] ?? STYLES.default;
  const label = "trendingrepo";

  let rank: number | null = null;
  let score: number | null = null;
  let categoryColor = FALLBACK_CATEGORY_COLOR;
  try {
    await refreshTrendingFromStore();
    const repo = getDerivedRepoByFullName(fullName);
    if (repo) {
      rank = typeof repo.rank === "number" && repo.rank > 0 ? repo.rank : null;
      score = typeof repo.trendScore24h === "number" ? repo.trendScore24h : null;
      const category = CATEGORIES.find((entry) => entry.id === repo.categoryId);
      if (category?.color) categoryColor = category.color;
    }
  } catch {
    // Fall through; emit a "tracked" badge rather than 5xx — README badges
    // failing loudly is a worse experience than a generic chip.
  }

  const value = badgeText(rank, score, includeRank);
  const svg = buildSvg(label, value, style, categoryColor, size);

  return new NextResponse(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=300",
    },
  });
}
