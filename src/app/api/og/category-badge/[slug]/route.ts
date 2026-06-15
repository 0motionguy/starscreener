// /api/og/category-badge/[slug] — Embeddable category-ranking badge (SVG).
//
// README authors can embed a live "Trending in <Category>" badge that links
// back to /categories/<slug>:
//
//   [![Trending in MCP](https://trendingrepo.com/api/og/category-badge/mcp.svg)](https://trendingrepo.com/categories/mcp)
//
// The endpoint accepts either `/mcp` or `/mcp.svg` — the `.svg` suffix is
// stripped server-side so the URL looks like a "real" image asset to the
// markdown renderers that demand a file extension (GitHub README does).
//
// Defensibility note (v3 deltas plan): we already ship embeddable star-history
// SVGs at /api/og/star-history and treemap thumbnails at /api/og/top10 — every
// embed is free viral marketing AND a defensibility moat (someone has to host
// + classify + re-render the same payload to replace us). This is the third
// embed surface, scoped to the per-category leaderboard.
//
// Output: a self-contained 480x80 inline SVG document. No external font or
// image references — system-font stack only, inline path geometry for the
// category icon glyph. Safe to embed on any host (GitHub camo-proxies the
// SVG; image/svg+xml is on its allowlist).
//
// Cache-Control:
//   - 1h fresh + 24h SWR (s-maxage=3600, stale-while-revalidate=86400)
//   - Badges don't need to be live — they refresh on the next read after the
//     worker tick. SWR window keeps GitHub camo + edge caches warm.
//
// Freshness state:
//   - If the trending payload is older than 4h we render a "Refreshing" state
//     instead of stale top-3 picks. The pattern matches consensus-trending's
//     stale-after-6h guard (this one's tighter because badges are public).

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { CATEGORIES } from "@/lib/constants";
import { getDerivedRepos } from "@/lib/derived-repos";
import { getLastFetchedAt, refreshTrendingFromStore } from "@/lib/trending";
import { OG_COLORS } from "@/lib/seo";
import { formatNumber } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 1h fresh + 24h SWR — badges live in READMEs that get crawled once a day by
// GitHub camo, so a generous SWR is appropriate. We don't need sub-hour
// freshness; the worker ticks every ~10-15min and that lag is invisible at
// embed cadence.
const CACHE_HEADER = "public, s-maxage=3600, stale-while-revalidate=86400";

// 4h staleness threshold. Beyond this we show the "Refreshing" state so a
// stuck worker doesn't silently advertise a snapshot from yesterday in every
// embedded README on the internet.
const STALE_AFTER_MS = 4 * 60 * 60 * 1000;

const WIDTH = 480;
const HEIGHT = 80;
// Left "chip" segment width. Category color background + icon + short name.
const CHIP_WIDTH = 144;

// Inline path geometry for each Lucide icon name referenced in
// CATEGORIES[i].icon. Drawn at 24x24 (translate(x, y) scale(1)) — lucide
// icons are MIT-licensed and these are simplified glyph traces, not pixel-
// identical copies. We can't import lucide-react server-side without
// pulling React, so inline path data keeps the SVG self-contained.
const ICON_PATHS: Record<string, string> = {
  // Brain — two cerebral lobes
  Brain:
    "M9.5 2A2.5 2.5 0 0 0 7 4.5v.5a2.5 2.5 0 0 0-2 4.45 2.5 2.5 0 0 0 0 4.1 2.5 2.5 0 0 0 2 4.45v.5A2.5 2.5 0 0 0 9.5 21h0a2.5 2.5 0 0 0 2.5-2.5V4.5A2.5 2.5 0 0 0 9.5 2zM14.5 2A2.5 2.5 0 0 1 17 4.5v.5a2.5 2.5 0 0 1 2 4.45 2.5 2.5 0 0 1 0 4.1 2.5 2.5 0 0 1-2 4.45v.5a2.5 2.5 0 0 1-2.5 2.5h0a2.5 2.5 0 0 1-2.5-2.5V4.5A2.5 2.5 0 0 1 14.5 2z",
  // Globe — circle with meridians
  Globe:
    "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 0v20M2 12h20M5 5a14 14 0 0 1 14 0M5 19a14 14 0 0 1 14 0",
  // Wrench — pipe wrench silhouette
  Wrench:
    "M14.7 6.3a3 3 0 0 0 4 4l2.6 2.6a1 1 0 0 1 0 1.4l-1.4 1.4a1 1 0 0 1-1.4 0L4.2 1.4a3 3 0 0 0-4 4L3 7.6 2 8.6a1 1 0 0 0 0 1.4L8.5 16.5a1 1 0 0 0 1.4 0l1-1 2.2 2.2",
  // Server — two stacked rack units
  Server:
    "M4 4h16v6H4zM4 14h16v6H4zM7 7h.01M7 17h.01",
  // Database — cylinder
  Database:
    "M4 6c0-2 4-3 8-3s8 1 8 3v12c0 2-4 3-8 3s-8-1-8-3V6zM4 6c0 2 4 3 8 3s8-1 8-3M4 12c0 2 4 3 8 3s8-1 8-3",
  // Shield — heraldic shield
  Shield: "M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z",
  // Smartphone
  Smartphone:
    "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01",
  // BarChart3 — three bars
  BarChart3: "M3 3v18h18M7 14v4M12 8v10M17 4v14",
  // Coins — two stacked coins
  Coins:
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM15 21a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 11h10M10 21h10",
  // Cog — gear silhouette
  Cog: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
};

// Fallback glyph when an icon name doesn't have inline geometry. A simple
// star — appropriate brand for TrendingRepo and never empty.
const FALLBACK_ICON_PATH =
  "M12 2 14.4 8.6 21 9 16 13.4 17.6 20 12 16.4 6.4 20 8 13.4 3 9 9.6 8.6z";

// Escape XML special chars in user-derived strings. We control most of what
// renders into the SVG, but repo names and category descriptions flow from
// data that could contain `<`, `>`, `&`, `'`, `"`.
function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Truncate with ellipsis at character count (SVG has no native text wrap and
// no measureText without a renderer — character budget is the pragmatic cap).
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

interface BadgeRowData {
  fullName: string;
  composite: number;
}

interface BadgeState {
  category: (typeof CATEGORIES)[number];
  rows: BadgeRowData[];
  refreshing: boolean;
}

function pickTopRows(categoryId: string): BadgeRowData[] {
  // Top-3 in this category by categoryRank ascending. categoryRank is 1-based
  // and assigned during the derived-repos build pass, so reading it is much
  // cheaper than re-sorting the full repo list per request.
  const repos = getDerivedRepos();
  const inCategory = repos
    .filter((r) => r.categoryId === categoryId && r.categoryRank > 0)
    .sort((a, b) => a.categoryRank - b.categoryRank)
    .slice(0, 3);
  return inCategory.map((r) => ({
    fullName: r.fullName,
    composite: r.momentumScore,
  }));
}

function categoryFreshnessMs(): number {
  const iso = getLastFetchedAt();
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Date.now() - t;
}

function buildSvg(state: BadgeState): string {
  const { category, rows, refreshing } = state;
  const chipColor = category.color;
  const iconPath = ICON_PATHS[category.icon] ?? FALLBACK_ICON_PATH;

  // Right-segment layout. Three rows of 18px line-height, top padding 14px.
  // When rows is empty we render a single "Trending in <Category>" line.
  const rightX = CHIP_WIDTH + 16;
  const rightWidth = WIDTH - CHIP_WIDTH - 16;

  const headline = refreshing
    ? `Refreshing · ${category.name}`
    : rows.length === 0
      ? `Trending in ${category.name}`
      : `Trending in ${category.name}`;

  const headlineEsc = escapeXml(truncate(headline, 38));

  let rowsMarkup = "";
  if (rows.length === 0 || refreshing) {
    // Sub-line for the generic state. Keeps the badge feeling "alive" even
    // when the classifier hasn't filled this category yet.
    const subline = refreshing
      ? `latest snapshot is warming · see trendingrepo.com`
      : `${category.shortName} momentum · trendingrepo.com`;
    rowsMarkup = `<text x="${rightX}" y="56" font-size="14" fill="${OG_COLORS.textSecondary}" font-family="ui-sans-serif, system-ui, sans-serif">${escapeXml(truncate(subline, 50))}</text>`;
  } else {
    const startY = 42;
    const lineH = 16;
    const RANK_BADGES = ["#1", "#2", "#3"];
    rowsMarkup = rows
      .map((row, i) => {
        const y = startY + i * lineH;
        const rank = RANK_BADGES[i] ?? `#${i + 1}`;
        const name = truncate(row.fullName, 28);
        const score = formatNumber(Math.round(row.composite));
        // Per-row layout: rank badge (28px), repo name (centre), composite
        // score right-aligned to the SVG right edge with a 12px gutter.
        return [
          `<text x="${rightX}" y="${y}" font-size="11" font-weight="700" fill="${chipColor}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${escapeXml(rank)}</text>`,
          `<text x="${rightX + 28}" y="${y}" font-size="12" fill="${OG_COLORS.textPrimary}" font-family="ui-sans-serif, system-ui, sans-serif">${escapeXml(name)}</text>`,
          `<text x="${WIDTH - 12}" y="${y}" font-size="11" fill="${OG_COLORS.textTertiary}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" text-anchor="end">${escapeXml(score)}</text>`,
        ].join("");
      })
      .join("");
  }

  // Icon glyph — drawn at 24x24, translated to chip centre and stroked
  // (Lucide uses 2px round strokes). The native viewBox is 0 0 24 24 so we
  // translate to (32, 20) for a 28px icon area at the top of the chip.
  const iconMarkup = [
    `<g transform="translate(20 14) scale(2)" fill="none" stroke="${OG_COLORS.textPrimary}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,
    `<path d="${iconPath}"/>`,
    `</g>`,
  ].join("");

  // Short name baseline at y=70 inside the chip.
  const chipLabel = escapeXml(truncate(category.shortName, 12));

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(`Trending in ${category.name} on TrendingRepo`)}">`,
    // Background — full card uses TrendingRepo bg.
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${OG_COLORS.bg}"/>`,
    // Border (1px stroke inset). Keeps the badge legible on light hosts.
    `<rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${HEIGHT - 1}" fill="none" stroke="${OG_COLORS.border}"/>`,
    // Left chip — category color block.
    `<rect width="${CHIP_WIDTH}" height="${HEIGHT}" fill="${chipColor}"/>`,
    iconMarkup,
    `<text x="${CHIP_WIDTH / 2}" y="70" font-size="13" font-weight="700" fill="${OG_COLORS.textPrimary}" font-family="ui-sans-serif, system-ui, sans-serif" text-anchor="middle" letter-spacing="0.5">${chipLabel}</text>`,
    // Right segment — headline + rows.
    `<text x="${rightX}" y="22" font-size="13" font-weight="700" fill="${OG_COLORS.textPrimary}" font-family="ui-sans-serif, system-ui, sans-serif">${headlineEsc}</text>`,
    `<line x1="${rightX}" x2="${WIDTH - 12}" y1="28" y2="28" stroke="${OG_COLORS.border}" stroke-width="1"/>`,
    rowsMarkup,
    // Brand strip — 3px brand-orange bar across the bottom right.
    `<rect x="${CHIP_WIDTH}" y="${HEIGHT - 3}" width="${rightWidth + 16}" height="3" fill="${OG_COLORS.brand}"/>`,
    `</svg>`,
  ].join("");
}

// `.svg` suffix support: README authors paste URLs like
// `.../category-badge/mcp.svg` because markdown renderers need an image
// extension. We strip `.svg` server-side so the slug lookup still hits
// CATEGORIES[i].id.
function normalizeSlug(raw: string): string {
  const lower = raw.toLowerCase();
  return lower.endsWith(".svg") ? lower.slice(0, -4) : lower;
}

function svgResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": CACHE_HEADER,
    },
  });
}

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { slug: rawSlug } = await context.params;
  const slug = normalizeSlug(rawSlug);

  const category = CATEGORIES.find((c) => c.id === slug);
  if (!category) {
    // Unknown slug — return a placeholder badge with TrendingRepo brand
    // colors and the requested slug echoed back. Avoids 404 noise in
    // README crawlers and tells the author exactly which slug failed.
    const placeholder: BadgeState = {
      category: {
        id: slug,
        name: "Unknown category",
        shortName: truncate(rawSlug || "?", 12),
        description: "",
        icon: "BarChart3",
        color: OG_COLORS.textTertiary,
      },
      rows: [],
      refreshing: false,
    };
    return svgResponse(buildSvg(placeholder), 404);
  }

  // Pull fresh trending payload. The 60s in-memory dedup inside
  // refreshTrendingFromStore() keeps this cheap under embed load.
  try {
    await refreshTrendingFromStore();
  } catch {
    // Refresh failure falls through to whatever the in-memory snapshot
    // had. The freshness gate below catches genuinely stale state.
  }

  const ageMs = categoryFreshnessMs();
  const refreshing = ageMs > STALE_AFTER_MS;
  const rows = refreshing ? [] : pickTopRows(slug);

  const body = buildSvg({ category, rows, refreshing });
  return svgResponse(body);
}
