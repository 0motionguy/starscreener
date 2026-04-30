// TrendingRepo — /api/og/top10
//
// 4-aspect share card for /top10. Renders any category × window × aspect
// combination as a PNG (default) or SVG (?format=svg). Composition mirrors
// the on-page ranking but tuned for thumbnail legibility — top 5 rows for
// h/sq/yt, top 10 for v (IG Story portrait).
//
// Imports the same builders the page uses so the card and the page can never
// drift on rank order.

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getDerivedRepos } from "@/lib/derived-repos";
import { getHfModelsTrending, refreshHfModelsFromStore } from "@/lib/huggingface";
import {
  getSkillsSignalData,
  getMcpSignalData,
} from "@/lib/ecosystem-leaderboards";
import {
  getHnTopStories,
  refreshHackernewsTrendingFromStore,
} from "@/lib/hackernews-trending";
import {
  getBlueskyTopPosts,
  refreshBlueskyTrendingFromStore,
} from "@/lib/bluesky-trending";
import {
  getDevtoTopArticles,
  refreshDevtoTrendingFromStore,
} from "@/lib/devto-trending";
import {
  getLobstersTopStories,
  refreshLobstersTrendingFromStore,
} from "@/lib/lobsters-trending";
import {
  getRecentLaunches,
  refreshProducthuntLaunchesFromStore,
} from "@/lib/producthunt";
import {
  getFundingSignalsThisWeek,
  refreshFundingNewsFromStore,
} from "@/lib/funding-news";

import { Dot, StarMark, truncate } from "@/lib/og-primitives";
import {
  buildAgentTop10,
  buildFundingTop10,
  buildLlmTop10,
  buildMcpTop10,
  buildMoversTop10,
  buildNewsTop10,
  buildRepoTop10,
  buildSkillsTop10,
  emptyBundle,
} from "@/lib/top10/builders";
import {
  CATEGORY_META,
  TOP10_CATEGORIES,
  TOP10_WINDOWS,
  type Top10Bundle,
  type Top10Category,
  type Top10Item,
  type Top10Window,
} from "@/lib/top10/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASPECT_DIMENSIONS = {
  h: { width: 1200, height: 675 },
  sq: { width: 1080, height: 1080 },
  v: { width: 1080, height: 1350 },
  yt: { width: 1280, height: 720 },
} as const;

type Aspect = keyof typeof ASPECT_DIMENSIONS;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=3600";

const TITLE_BY_CATEGORY: Record<Top10Category, string> = {
  repos: "The 10 repos\neveryone's starring.",
  llms: "The 10 models\neveryone's downloading.",
  agents: "The 10 agents\neveryone's running.",
  mcps: "The 10 MCPs\nshipping the most.",
  skills: "The 10 skills\neveryone's installing.",
  movers: "The 10 fastest\nmovers right now.",
  news: "The 10 stories\nfeeds can't ignore.",
  funding: "The 10 biggest\nrounds this week.",
};

// ---------------------------------------------------------------------------
// Themes — three selectable palettes for share-card downloads.
// ---------------------------------------------------------------------------

type Theme = "dark" | "light" | "mono";

type ThemeColors = {
  bg: string;
  textPrimary: string;
  textTertiary: string;
  brand: string;          // accent strip + date label + corner ticks + header star
  up: string;             // LIVE dot + score text
  // Top-3 rail colors (4th onward uses railRest)
  rail1: string;
  rail2: string;
  rail3: string;
  railRest: string;       // dim rail for ranks 4+
  rankRest: string;       // rank number color for ranks 4+
  accentStrip: string;    // bottom 8px strip
};

const THEMES: Record<Theme, ThemeColors> = {
  // Current operator-terminal card. Do not touch.
  dark: {
    bg: "#151419",
    textPrimary: "#FBFBFB",
    textTertiary: "#878787",
    brand: "#F56E0F",
    up: "#22C55E",
    rail1: "#ffd24d",
    rail2: "#c0c5cc",
    rail3: "#cd7f32",
    railRest: "rgba(255,255,255,0.10)",
    rankRest: "rgba(255,255,255,0.45)",
    accentStrip: "#F56E0F",
  },
  // High-contrast ivory card for LinkedIn / docs. Brand orange retained as accent.
  light: {
    bg: "#fafaf7",
    textPrimary: "#0c0d10",
    textTertiary: "#525a63",
    brand: "#F56E0F",
    up: "#15803d",
    rail1: "#d4a017", // muted gold reads better on ivory
    rail2: "#9aa1ab",
    rail3: "#a8702a",
    railRest: "rgba(12,13,16,0.12)",
    rankRest: "rgba(12,13,16,0.42)",
    accentStrip: "#F56E0F",
  },
  // Brutalist print-zine. Pure greyscale + a single green for liveness.
  mono: {
    bg: "#000000",
    textPrimary: "#f5f5f5",
    textTertiary: "#9a9a9a",
    brand: "#f5f5f5",       // ink-tone accents (no orange)
    up: "#b8ff7a",          // green dot ONLY for liveness signal
    rail1: "#ffffff",
    rail2: "#b8b8b8",
    rail3: "#6e6e6e",
    railRest: "rgba(245,245,245,0.10)",
    rankRest: "rgba(245,245,245,0.45)",
    accentStrip: "#f5f5f5", // ink strip, not orange
  },
};

function parseTheme(value: string | null): Theme {
  if (value === "light" || value === "mono" || value === "dark") return value;
  return "dark";
}

// ---------------------------------------------------------------------------
// Bundle resolver — picks the right builder per category, refreshes async
// data sources first.
// ---------------------------------------------------------------------------

async function resolveBundle(
  category: Top10Category,
  window: Top10Window,
): Promise<Top10Bundle> {
  switch (category) {
    case "repos":
    case "agents":
    case "movers": {
      // Repo-derived. getDerivedRepos is sync + cached, no refresh needed.
      const repos = getDerivedRepos();
      if (category === "repos") return buildRepoTop10(repos, window);
      if (category === "agents") return buildAgentTop10(repos, window);
      return buildMoversTop10(repos, window);
    }
    case "llms": {
      await refreshHfModelsFromStore().catch(() => undefined);
      const models = getHfModelsTrending(40);
      return models.length > 0 ? buildLlmTop10(models, window) : emptyBundle(window);
    }
    case "mcps": {
      const mcp = await getMcpSignalData().catch(() => null);
      return buildMcpTop10(mcp?.board ?? null, window);
    }
    case "skills": {
      const skills = await getSkillsSignalData().catch(() => null);
      return buildSkillsTop10(skills?.combined ?? null, window);
    }
    case "news": {
      await Promise.allSettled([
        refreshHackernewsTrendingFromStore(),
        refreshBlueskyTrendingFromStore(),
        refreshDevtoTrendingFromStore(),
        refreshLobstersTrendingFromStore(),
        refreshProducthuntLaunchesFromStore(),
      ]);
      return buildNewsTop10({
        hn: getHnTopStories(40),
        bluesky: getBlueskyTopPosts(40),
        devto: getDevtoTopArticles(40),
        lobsters: getLobstersTopStories(40),
        producthunt: getRecentLaunches(7, 40),
      });
    }
    case "funding": {
      await refreshFundingNewsFromStore().catch(() => undefined);
      const signals = getFundingSignalsThisWeek();
      return signals.length > 0 ? buildFundingTop10(signals) : emptyBundle("7d");
    }
  }
}

// ---------------------------------------------------------------------------
// SVG — used for in-page preview and as a download fallback.
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSvg(
  bundle: Top10Bundle,
  category: Top10Category,
  window: Top10Window,
  width: number,
  height: number,
  rowCount: number,
  theme: Theme,
): string {
  const c = THEMES[theme];
  const padX = Math.round(width * 0.06);
  const padTop = Math.round(height * 0.08);
  const headerH = Math.round(height * 0.22);
  const footerH = Math.round(height * 0.08);
  const listTop = padTop + headerH;
  const listH = height - listTop - footerH - padTop * 0.5;
  const rowH = listH / Math.max(1, rowCount);

  const titleLines = TITLE_BY_CATEGORY[category].split("\n");
  const titleSize = Math.round(height * 0.06);
  const numberLabel = `// ${new Date().toISOString().slice(0, 10)}`;

  const header = `
    <g>
      <text x="${padX}" y="${padTop * 0.7}" font-family="ui-monospace,monospace" font-size="${Math.round(height * 0.018)}" fill="${c.textTertiary}" letter-spacing="2">// TRENDINGREPO · TOP 10 · ${category.toUpperCase()} · ${window.toUpperCase()}</text>
      <text x="${width - padX}" y="${padTop * 0.7}" text-anchor="end" font-family="ui-monospace,monospace" font-size="${Math.round(height * 0.018)}" fill="${c.up}" letter-spacing="2">● LIVE</text>
      <text x="${padX}" y="${padTop + Math.round(headerH * 0.2)}" font-family="ui-monospace,monospace" font-size="${Math.round(height * 0.022)}" fill="${c.brand}" letter-spacing="3" font-weight="600">${escapeXml(numberLabel)}</text>
      ${titleLines
        .map(
          (l, i) =>
            `<text x="${padX}" y="${padTop + Math.round(headerH * 0.45) + i * titleSize * 1.05}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="${titleSize}" fill="${c.textPrimary}" font-weight="800" letter-spacing="-1">${escapeXml(l)}</text>`,
        )
        .join("")}
    </g>
  `;

  const rows = bundle.items
    .slice(0, rowCount)
    .map((item, i) => {
      const y = listTop + i * rowH;
      const railColor =
        i === 0 ? c.rail1 : i === 1 ? c.rail2 : i === 2 ? c.rail3 : c.railRest;
      const titleText = escapeXml(formatItemTitle(item));
      const scoreText =
        item.deltaPct !== undefined
          ? `${item.deltaPct >= 0 ? "+" : ""}${item.deltaPct.toFixed(0)}%`
          : item.score.toFixed(2);
      const rankSize = Math.round(rowH * 0.55);
      const titleSizePx = Math.round(rowH * 0.42);
      const scoreSizePx = Math.round(rowH * 0.36);
      return `
        <g>
          <rect x="${padX}" y="${y + 4}" width="3" height="${rowH - 8}" fill="${railColor}"/>
          <text x="${padX + 14}" y="${y + rowH * 0.62}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="${rankSize}" fill="${i < 3 ? railColor : c.rankRest}" font-weight="700">${String(item.rank).padStart(2, "0")}</text>
          <text x="${padX + 14 + rankSize * 1.4}" y="${y + rowH * 0.6}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="${titleSizePx}" fill="${c.textPrimary}" font-weight="600">${titleText}</text>
          <text x="${width - padX}" y="${y + rowH * 0.6}" text-anchor="end" font-family="ui-monospace,monospace" font-size="${scoreSizePx}" fill="${c.up}" font-weight="600">${escapeXml(scoreText)}</text>
        </g>
      `;
    })
    .join("");

  const footerY = height - footerH * 0.4;
  const footer = `
    <g>
      <text x="${padX}" y="${footerY}" font-family="ui-monospace,monospace" font-size="${Math.round(height * 0.016)}" fill="${c.textTertiary}" letter-spacing="2">TRENDINGREPO.COM/TOP10</text>
      <text x="${width - padX}" y="${footerY}" text-anchor="end" font-family="ui-monospace,monospace" font-size="${Math.round(height * 0.016)}" fill="${c.textPrimary}" letter-spacing="2">${escapeXml(bundle.meta.totalMovement.toUpperCase())}</text>
      <rect x="0" y="${height - 6}" width="${width}" height="6" fill="${c.accentStrip}"/>
    </g>
  `;

  // Brand corner ticks (matches on-page card)
  const tick = 14;
  const corners = [
    `<polyline points="${padX - 8},${padTop - 8} ${padX - 8 + tick},${padTop - 8} ${padX - 8},${padTop - 8} ${padX - 8},${padTop - 8 + tick}" fill="none" stroke="${c.brand}" stroke-width="1.5"/>`,
    `<polyline points="${width - padX + 8},${padTop - 8} ${width - padX + 8 - tick},${padTop - 8} ${width - padX + 8},${padTop - 8} ${width - padX + 8},${padTop - 8 + tick}" fill="none" stroke="${c.brand}" stroke-width="1.5"/>`,
    `<polyline points="${padX - 8},${height - footerY - 6 + footerH} ${padX - 8 + tick},${height - footerY - 6 + footerH} ${padX - 8},${height - footerY - 6 + footerH} ${padX - 8},${height - footerY - 6 + footerH - tick}" fill="none" stroke="${c.brand}" stroke-width="1.5"/>`,
  ].join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${c.bg}"/><g opacity="0.5">${corners}</g>${header}${rows}${footer}</svg>`;
}

function formatItemTitle(item: Top10Item): string {
  const owner = item.owner ? `${item.owner} / ` : "";
  return truncate(`${owner}${item.title}`, 36);
}

// ---------------------------------------------------------------------------
// PNG card via next/og ImageResponse.
// ---------------------------------------------------------------------------

function CardJSX({
  bundle,
  category,
  window,
  width,
  height,
  rowCount,
  theme,
}: {
  bundle: Top10Bundle;
  category: Top10Category;
  window: Top10Window;
  width: number;
  height: number;
  rowCount: number;
  theme: Theme;
}) {
  const c = THEMES[theme];
  const titleLines = TITLE_BY_CATEGORY[category].split("\n");
  const padding =
    width >= 1200 ? "48px 64px" : width >= 1080 ? "44px 52px" : "40px 48px";

  const titleSize = Math.round(height * 0.058);
  const subSize = Math.round(height * 0.018);
  const rowGap = 8;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: c.bg,
        color: c.textPrimary,
        padding,
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      {/* Header strip */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "monospace",
          fontSize: subSize,
          color: c.textTertiary,
          letterSpacing: 2,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StarMark size={subSize + 2} color={c.brand} />
          <span>{`// TRENDINGREPO · TOP 10 · ${category.toUpperCase()} · ${window.toUpperCase()}`}</span>
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: c.up,
          }}
        >
          <Dot size={subSize} color={c.up} />
          <span style={{ display: "flex" }}>LIVE</span>
        </span>
      </div>

      {/* Date pill */}
      <div
        style={{
          display: "flex",
          marginTop: 24,
          fontFamily: "monospace",
          fontSize: Math.round(height * 0.022),
          color: c.brand,
          letterSpacing: 3,
          fontWeight: 600,
        }}
      >
        {`// ${new Date().toISOString().slice(0, 10)}`}
      </div>

      {/* Title */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 8,
        }}
      >
        {titleLines.map((l, i) => (
          <span
            key={i}
            style={{
              fontSize: titleSize,
              fontWeight: 800,
              letterSpacing: -1,
              lineHeight: 1,
              color: c.textPrimary,
            }}
          >
            {l}
          </span>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 8,
          fontFamily: "monospace",
          fontSize: subSize,
          color: c.textTertiary,
          letterSpacing: 2,
        }}
      >
        {`${windowDisplay(window)} · ${bundle.meta.meanScore} · ${bundle.meta.totalMovement.toUpperCase()}`}
      </div>

      {/* Rows */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 28,
          gap: rowGap,
          flex: 1,
        }}
      >
        {bundle.items.slice(0, rowCount).map((item, i) => (
          <CardRow
            key={item.slug}
            item={item}
            index={i}
            height={height}
            theme={theme}
          />
        ))}
        {bundle.items.length === 0 && (
          <span
            style={{
              display: "flex",
              fontFamily: "monospace",
              color: c.textTertiary,
              fontSize: subSize,
            }}
          >
            {"// no entries yet — check back after the next refresh"}
          </span>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 12,
          fontFamily: "monospace",
          fontSize: subSize,
          color: c.textTertiary,
          letterSpacing: 2,
        }}
      >
        <span>TRENDINGREPO.COM/TOP10</span>
        <span style={{ display: "flex", color: c.textPrimary }}>
          {bundle.meta.totalMovement.toUpperCase()}
        </span>
      </div>

      {/* Accent strip */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 8,
          backgroundColor: c.accentStrip,
          display: "flex",
        }}
      />
    </div>
  );
}

function CardRow({
  item,
  index,
  height,
  theme,
}: {
  item: Top10Item;
  index: number;
  height: number;
  theme: Theme;
}) {
  const c = THEMES[theme];
  const railColor =
    index === 0
      ? c.rail1
      : index === 1
        ? c.rail2
        : index === 2
          ? c.rail3
          : c.railRest;
  const rowFontTitle = Math.round(height * 0.034);
  const rowFontRank = Math.round(height * 0.038);
  const rowFontScore = Math.round(height * 0.026);
  const owner = item.owner ? `${item.owner} / ` : "";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "6px 0 6px 12px",
        borderLeft: `3px solid ${railColor}`,
      }}
    >
      <span
        style={{
          display: "flex",
          fontSize: rowFontRank,
          fontWeight: 700,
          color: index < 3 ? railColor : c.rankRest,
          width: 56,
          fontFamily: "sans-serif",
        }}
      >
        {String(item.rank).padStart(2, "0")}
      </span>
      <span
        style={{
          display: "flex",
          flex: 1,
          fontSize: rowFontTitle,
          color: c.textPrimary,
          fontWeight: 600,
          fontFamily: "sans-serif",
          overflow: "hidden",
        }}
      >
        {truncate(owner + item.title, 40)}
      </span>
      <span
        style={{
          display: "flex",
          fontSize: rowFontScore,
          fontFamily: "monospace",
          color: c.up,
          fontWeight: 600,
        }}
      >
        {item.deltaPct !== undefined
          ? `${item.deltaPct >= 0 ? "+" : ""}${item.deltaPct.toFixed(0)}%`
          : item.score.toFixed(2)}
      </span>
    </div>
  );
}

function windowDisplay(w: Top10Window): string {
  switch (w) {
    case "24h":
      return "24-HOUR WINDOW";
    case "7d":
      return "7-DAY WINDOW";
    case "30d":
      return "30-DAY WINDOW";
    case "ytd":
      return "YEAR-TO-DATE";
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

function parseCategory(value: string | null): Top10Category {
  if (!value) return "repos";
  return TOP10_CATEGORIES.includes(value as Top10Category)
    ? (value as Top10Category)
    : "repos";
}

function parseWindow(
  value: string | null,
  fallback: Top10Window,
): Top10Window {
  if (!value) return fallback;
  return TOP10_WINDOWS.includes(value as Top10Window)
    ? (value as Top10Window)
    : fallback;
}

function parseAspect(value: string | null): Aspect {
  if (value === "sq" || value === "v" || value === "yt" || value === "h") {
    return value;
  }
  return "h";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = parseCategory(searchParams.get("cat"));
  const window = parseWindow(
    searchParams.get("window"),
    CATEGORY_META[category].defaultWindow,
  );
  const aspect = parseAspect(searchParams.get("aspect"));
  const format = searchParams.get("format") === "svg" ? "svg" : "png";
  const theme = parseTheme(searchParams.get("theme"));
  const dim = ASPECT_DIMENSIONS[aspect];

  // 5 rows for h/sq/yt; 10 rows for v (IG Story portrait has the headroom).
  const rowCount = aspect === "v" ? 10 : 5;

  const bundle = await resolveBundle(category, window);

  if (format === "svg") {
    const svg = buildSvg(
      bundle,
      category,
      window,
      dim.width,
      dim.height,
      rowCount,
      theme,
    );
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": CACHE_HEADER,
        ...(searchParams.get("download") === "1"
          ? {
              "Content-Disposition": `attachment; filename="top10-${category}-${aspect}-${theme}-${todayStamp()}.svg"`,
            }
          : {}),
      },
    });
  }

  return new ImageResponse(
    (
      <CardJSX
        bundle={bundle}
        category={category}
        window={window}
        width={dim.width}
        height={dim.height}
        rowCount={rowCount}
        theme={theme}
      />
    ),
    {
      ...dim,
      headers: { "Cache-Control": CACHE_HEADER },
    },
  );
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
