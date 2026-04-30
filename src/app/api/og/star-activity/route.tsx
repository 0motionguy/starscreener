// TrendingRepo — Star Activity OG / share-card endpoint.
//
// Renders the operator-terminal "// STAR ACTIVITY" card as PNG (default) or
// SVG (?format=svg). Used as the og:image / twitter:image for the dedicated
// star-activity routes AND as the explicit "Share on X" download target —
// pasting the URL into a tweet auto-unfurls with this image.
//
// Query contract:
//   repos=owner/name[,owner/name...]   1..4 repos (matches /compare cap)
//   mode=date|timeline                  default: date
//   scale=lin|log                       default: lin
//   aspect=h|v                          h = 1200x675, v = 1080x1350. Default h.
//   format=png|svg                      default: png
//   v=<bust>                            opaque cache-buster (passes through)
//
// Renderer: next/og's ImageResponse (Satori) for PNG; we hand-roll an SVG
// document for the svg variant. Both share buildLinePath() so the curves
// match exactly. No client JS, no headless browser.

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getDataStore } from "@/lib/data-store";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { OG_COLORS } from "@/lib/seo";
import { StarMark } from "@/lib/og-primitives";
import {
  computeMindshareSeries,
  computeVelocitySeries,
  filterPayloadByWindow,
  type StarActivityMetric,
  type StarActivityMode,
  type StarActivityPayload,
  type StarActivityScale,
  type StarActivityWindow,
} from "@/lib/star-activity";
import {
  CHART_THEMES,
  type ChartTheme,
} from "@/components/compare/themes";
import type { Repo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FULL_NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const MAX_REPOS = 5;

const ASPECT_DIMENSIONS = {
  h: { width: 1200, height: 675 },   // X / Twitter summary_large_image
  v: { width: 1080, height: 1350 },  // Instagram portrait 4:5
  yt: { width: 1280, height: 720 },  // YouTube thumbnail 16:9
} as const;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=3600";

type AspectKey = keyof typeof ASPECT_DIMENSIONS;

interface ParsedQuery {
  repos: string[];
  mode: StarActivityMode;
  scale: StarActivityScale;
  aspect: AspectKey;
  format: "png" | "svg";
  metric: StarActivityMetric;
  window: StarActivityWindow;
  theme: ChartTheme;
  watermark: boolean;
}

const VALID_METRIC: ReadonlySet<StarActivityMetric> = new Set([
  "stars",
  "velocity",
  "mindshare",
]);
const VALID_WINDOW: ReadonlySet<StarActivityWindow> = new Set([
  "7d",
  "30d",
  "90d",
  "6m",
  "1y",
  "all",
]);
const VALID_THEME: ReadonlySet<ChartTheme> = new Set([
  "terminal",
  "neon",
  "gradient",
  "crt",
  "poster",
]);

function parseQuery(
  searchParams: URLSearchParams,
): ParsedQuery | { error: string } {
  const reposParam = searchParams.get("repos") ?? "";
  const repos = reposParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (repos.length === 0) return { error: "missing_repos" };
  if (repos.length > MAX_REPOS) return { error: "too_many_repos" };
  for (const r of repos) {
    if (!FULL_NAME_RE.test(r)) return { error: "invalid_repo" };
  }

  const mode: StarActivityMode =
    searchParams.get("mode") === "timeline" ? "timeline" : "date";
  const scale: StarActivityScale =
    searchParams.get("scale") === "log" ? "log" : "lin";
  const aspectRaw = searchParams.get("aspect") ?? "h";
  const aspect: AspectKey =
    aspectRaw in ASPECT_DIMENSIONS ? (aspectRaw as AspectKey) : "h";
  const format: "png" | "svg" =
    searchParams.get("format") === "svg" ? "svg" : "png";

  const metricRaw = searchParams.get("metric") ?? "stars";
  const metric: StarActivityMetric = VALID_METRIC.has(
    metricRaw as StarActivityMetric,
  )
    ? (metricRaw as StarActivityMetric)
    : "stars";

  const windowRaw = searchParams.get("window") ?? "all";
  const window: StarActivityWindow = VALID_WINDOW.has(
    windowRaw as StarActivityWindow,
  )
    ? (windowRaw as StarActivityWindow)
    : "all";

  const themeRaw = searchParams.get("theme") ?? "terminal";
  const theme: ChartTheme = VALID_THEME.has(themeRaw as ChartTheme)
    ? (themeRaw as ChartTheme)
    : "terminal";

  // Watermark default ON — the share dropdown's "WATERMARKED" preset.
  // Operators / paid tier hint pass watermark=0 to get the bare chart.
  const watermark = searchParams.get("watermark") !== "0";

  return {
    repos,
    mode,
    scale,
    aspect,
    format,
    metric,
    window,
    theme,
    watermark,
  };
}

function payloadSlug(fullName: string): string {
  return `star-activity:${fullName.toLowerCase().replace("/", "__")}`;
}

interface RepoBundle {
  fullName: string;
  repo: Repo | null;
  payload: StarActivityPayload | null;
}

async function loadRepos(repos: string[]): Promise<RepoBundle[]> {
  const store = getDataStore();
  return Promise.all(
    repos.map(async (fullName): Promise<RepoBundle> => {
      const repo = getDerivedRepoByFullName(fullName);
      let payload: StarActivityPayload | null = null;
      try {
        const result = await store.read<StarActivityPayload>(
          payloadSlug(fullName),
        );
        payload = result.data;
      } catch {
        // Data-store miss is expected during cold starts and pre-backfill
        // periods. The legacy sparkline path takes over downstream.
      }
      return { fullName, repo, payload };
    }),
  );
}

interface RenderPoint {
  x: number;
  y: number;
  stars: number;
}

interface RenderSeries {
  fullName: string;
  color: string;
  points: RenderPoint[];
}

interface SeriesBundle {
  series: RenderSeries[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

function buildAllSeries(
  bundles: RepoBundle[],
  mode: StarActivityMode,
  scale: StarActivityScale,
  metric: StarActivityMetric,
  window: StarActivityWindow,
  theme: ChartTheme,
): SeriesBundle {
  const palette = CHART_THEMES[theme].palette;
  const series: RenderSeries[] = [];
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;

  // Pre-filter every bundle's payload by the chosen window once.
  const filtered = bundles.map((b) =>
    b.payload ? filterPayloadByWindow(b.payload, window) : null,
  );

  // For MINDSHARE we need the union of sibling payloads to compute the
  // share denominator. Build that once.
  const siblingPayloads = filtered.filter(
    (p): p is StarActivityPayload => p !== null && p.points.length > 0,
  );

  bundles.forEach((bundle, i) => {
    const color = palette[i % palette.length];
    const payload = filtered[i];

    if (payload && payload.points.length > 0) {
      let yByPoint: number[];
      if (metric === "velocity") {
        yByPoint = computeVelocitySeries(payload);
      } else if (metric === "mindshare") {
        const shareByDay = computeMindshareSeries(payload, siblingPayloads);
        yByPoint = payload.points.map((p) => shareByDay.get(p.d) ?? 0);
      } else {
        yByPoint = payload.points.map((p) => p.s);
      }
      const points: RenderPoint[] = payload.points.map((pt, j) => {
        const display = yByPoint[j];
        // Mindshare is already 0..100; never log-scale that.
        const effectiveScale = metric === "mindshare" ? "lin" : scale;
        const y =
          effectiveScale === "log" ? Math.log10(Math.max(1, display)) : display;
        return {
          x:
            mode === "timeline"
              ? j
              : Date.parse(`${pt.d}T00:00:00Z`),
          y,
          stars: pt.s,
        };
      });
      if (points.length === 0) return;
      series.push({ fullName: bundle.fullName, color, points });
      for (const p of points) {
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        if (p.y < yMin) yMin = p.y;
        if (p.y > yMax) yMax = p.y;
      }
      return;
    }

    // Legacy fallback — only meaningful for STARS metric.
    if (metric !== "stars") return;
    const sl = bundle.repo?.sparklineData ?? [];
    if (sl.length === 0) return;
    const today = Date.now();
    const points: RenderPoint[] = sl.map((s, j) => ({
      x:
        mode === "timeline"
          ? j
          : today - (sl.length - 1 - j) * 86_400_000,
      y: scale === "log" ? Math.log10(Math.max(1, s)) : s,
      stars: s,
    }));
    series.push({ fullName: bundle.fullName, color, points });
    for (const p of points) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }
  });

  if (!Number.isFinite(xMin)) xMin = 0;
  if (!Number.isFinite(xMax)) xMax = 1;
  if (!Number.isFinite(yMin)) yMin = 0;
  if (!Number.isFinite(yMax)) yMax = 1;

  return { series, xMin, xMax, yMin, yMax };
}

interface PathPair {
  line: string;
  area: string;
}

function buildLinePath(
  points: RenderPoint[],
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  width: number,
  height: number,
): PathPair {
  const padTop = 8;
  const padBottom = 8;
  const padLeft = 8;
  const padRight = 8;
  const usableW = width - padLeft - padRight;
  const usableH = height - padTop - padBottom;
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const mapped = points.map((p) => ({
    x: padLeft + ((p.x - xMin) / xRange) * usableW,
    y: padTop + (1 - (p.y - yMin) / yRange) * usableH,
  }));

  if (mapped.length === 0) return { line: "", area: "" };

  const line = mapped
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`,
    )
    .join(" ");
  const baselineY = padTop + usableH;
  const last = mapped[mapped.length - 1];
  const first = mapped[0];
  const area = `${line} L${last.x.toFixed(2)} ${baselineY} L${first.x.toFixed(2)} ${baselineY} Z`;
  return { line, area };
}

function formatStars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// SVG variant — chart-only, suitable for README embeds.
// ---------------------------------------------------------------------------

function buildSvgDocument(
  bundle: SeriesBundle,
  width: number,
  height: number,
): string {
  const { series, xMin, xMax, yMin, yMax } = bundle;
  const lines = series
    .map((s) => {
      const path = buildLinePath(
        s.points,
        xMin,
        xMax,
        yMin,
        yMax,
        width,
        height,
      );
      return `<path d="${path.line}" fill="none" stroke="${s.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${OG_COLORS.bg}"/>${lines}</svg>`;
}

// ---------------------------------------------------------------------------
// PNG variant — full operator-terminal card via ImageResponse.
// ---------------------------------------------------------------------------

function ErrorCard({
  width,
  height,
  message,
}: {
  width: number;
  height: number;
  message: string;
}) {
  return (
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
        position: "relative",
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
        }}
      >
        <StarMark size={44} color={OG_COLORS.brand} />
        <span>TrendingRepo</span>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 24,
          fontSize: 56,
          fontWeight: 700,
        }}
      >
        Star Activity
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 12,
          fontSize: 24,
          color: OG_COLORS.textTertiary,
          fontFamily: "monospace",
        }}
      >
        {`// ${message}`}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 8,
          backgroundColor: OG_COLORS.brand,
          display: "flex",
        }}
      />
      <div style={{ width, height, display: "none" }} />
    </div>
  );
}

function StarActivityCard({
  bundles,
  seriesBundle,
  mode,
  scale,
  aspect,
  theme,
  watermark,
}: {
  bundles: RepoBundle[];
  seriesBundle: SeriesBundle;
  mode: StarActivityMode;
  scale: StarActivityScale;
  aspect: AspectKey;
  theme: ChartTheme;
  watermark: boolean;
}) {
  const isVertical = aspect === "v";
  const { width, height } = ASPECT_DIMENSIONS[aspect];
  const themeConfig = CHART_THEMES[theme];
  const isLight = themeConfig.light;
  const textPrimary = isLight ? "#1f1f1f" : OG_COLORS.textPrimary;
  const textSecondary = isLight ? "#3a3a3a" : OG_COLORS.textSecondary;
  const textTertiary = isLight ? "#5a5a5a" : OG_COLORS.textTertiary;
  const cardBg = themeConfig.cardBg.startsWith("var(")
    ? OG_COLORS.bg
    : themeConfig.cardBg;
  const accentColor = isLight ? "#1f1f1f" : OG_COLORS.brand;

  const padding = isVertical
    ? "56px 64px 64px 64px"
    : aspect === "yt"
      ? "44px 64px 52px 64px"
      : "48px 72px 56px 72px";

  // Chart area sizing — leaves room for header, legend, stats, footer.
  const chartW =
    width - (isVertical ? 128 : aspect === "yt" ? 128 : 144);
  const chartH = isVertical ? 640 : aspect === "yt" ? 380 : 360;

  const isCompare = bundles.length > 1;
  const headerLabel = isCompare
    ? "// STAR ACTIVITY · COMPARE"
    : "// STAR ACTIVITY";

  const single = !isCompare ? bundles[0] : null;
  // Prefer payload's latest cumulative for the star count — repos in
  // star-activity Redis but not in our `derived-repos` index (e.g. when an
  // operator backfilled an untracked repo on demand) would otherwise render
  // as "★ 0" because getDerivedRepoByFullName() returns null.
  const payloadLatest =
    single?.payload && single.payload.points.length > 0
      ? single.payload.points[single.payload.points.length - 1].s
      : 0;
  const singleStars = single?.repo?.stars ?? payloadLatest;
  const singleDescription = single?.repo?.description ?? "";

  // Find peak daily delta and "since" date for the single-repo footer band.
  let peakDelta = 0;
  let sinceDate: string | null = null;
  if (single?.payload && single.payload.points.length > 0) {
    for (const p of single.payload.points) {
      if (p.delta > peakDelta) peakDelta = p.delta;
    }
    sinceDate = single.payload.points[0].d;
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: cardBg,
        color: textPrimary,
        padding,
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      {/* Watermark — faint text band behind the chart. Reads as brand
          attribution at thumbnail size; ignored at full size by viewers
          focused on the curves. Toggle with ?watermark=0 for the bare
          variant. Rendered as a div (not SVG <text>) because Satori
          doesn't render raw SVG <text> nodes. */}
      {watermark && (
        <div
          style={{
            position: "absolute",
            top: "30%",
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontFamily: "monospace",
            fontSize: isVertical ? 80 : 96,
            fontWeight: 800,
            letterSpacing: "0.08em",
            color: isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.03)",
            pointerEvents: "none",
            userSelect: "none",
            transform: "rotate(-8deg)",
            zIndex: 0,
          }}
        >
          {"// TRENDINGREPO"}
        </div>
      )}
      {/* Header strip */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          fontFamily: "monospace",
          fontSize: 22,
          letterSpacing: 1.4,
          color: textTertiary,
          zIndex: 1,
        }}
      >
        <span>{headerLabel}</span>
        <span>{todayStamp()}</span>
      </div>

      {/* Title block */}
      {single ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 16,
              fontSize: isVertical ? 56 : 64,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: OG_COLORS.textPrimary,
              maxWidth: "100%",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                display: "flex",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: chartW - 200,
              }}
            >
              {single.fullName}
            </span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 36,
                color: OG_COLORS.textSecondary,
                fontFamily: "monospace",
              }}
            >
              <StarMark size={28} color={OG_COLORS.brand} />
              <span>{formatStars(singleStars)}</span>
            </span>
          </div>
          {singleDescription && (
            <div
              style={{
                display: "flex",
                marginTop: 10,
                fontSize: 22,
                color: OG_COLORS.textSecondary,
                lineHeight: 1.35,
                maxWidth: chartW,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {truncate(singleDescription, isVertical ? 90 : 120)}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            marginTop: 16,
            gap: "10px 32px",
            maxWidth: chartW,
          }}
        >
          {bundles.map((b, i) => (
            <div
              key={b.fullName}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 24,
                fontFamily: "monospace",
                color: OG_COLORS.textPrimary,
              }}
            >
              <span
                style={{
                  display: "flex",
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  backgroundColor: themeConfig.palette[i % themeConfig.palette.length],
                }}
              />
              <span style={{ display: "flex" }}>{b.fullName}</span>
              <span
                style={{
                  display: "flex",
                  color: OG_COLORS.textTertiary,
                  marginLeft: 8,
                }}
              >
                {formatStars(b.repo?.stars ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div
        style={{
          display: "flex",
          marginTop: 28,
          width: chartW,
          height: chartH,
          alignSelf: "center",
        }}
      >
        <svg
          width={chartW}
          height={chartH}
          viewBox={`0 0 ${chartW} ${chartH}`}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Theme-aware horizontal grid */}
          {themeConfig.gridDensity !== "none" &&
            [0.25, 0.5, 0.75].map((frac) => (
              <line
                key={frac}
                x1={8}
                x2={chartW - 8}
                y1={chartH * frac}
                y2={chartH * frac}
                stroke={isLight ? "#1f1f1f" : OG_COLORS.border}
                strokeWidth={1}
                strokeDasharray={themeConfig.gridDash}
                opacity={isLight ? 0.15 : 0.5}
              />
            ))}
          {seriesBundle.series.map((s) => {
            const path = buildLinePath(
              s.points,
              seriesBundle.xMin,
              seriesBundle.xMax,
              seriesBundle.yMin,
              seriesBundle.yMax,
              chartW,
              chartH,
            );
            const lineStroke = !isCompare && theme === "terminal"
              ? OG_COLORS.brand
              : s.color;
            return (
              <g key={s.fullName}>
                {/* Gradient theme: stacked area fill underneath each line */}
                {themeConfig.areaFill && (
                  <path
                    d={path.area}
                    fill={s.color}
                    fillOpacity={themeConfig.areaFillOpacity}
                    stroke="none"
                  />
                )}
                {/* Single-repo terminal default: brand-orange dim fill —
                    legacy look preserved when theme=terminal AND single repo. */}
                {!isCompare &&
                  theme === "terminal" &&
                  !themeConfig.areaFill && (
                    <path
                      d={path.area}
                      fill={OG_COLORS.brandDim}
                      stroke="none"
                    />
                  )}
                {/* Outer glow stroke (neon / crt) — wider + low opacity */}
                {themeConfig.outerGlow && (
                  <path
                    d={path.line}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={themeConfig.outerGlowWidth}
                    strokeOpacity={themeConfig.outerGlowOpacity}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                <path
                  d={path.line}
                  fill="none"
                  stroke={lineStroke}
                  strokeWidth={themeConfig.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Stats / mode echo. Direct children of the flex parent (no fragment)
          so Satori's flex `gap` produces real spacing between columns. */}
      <div
        style={{
          display: "flex",
          marginTop: 20,
          gap: 32,
          fontFamily: "monospace",
          fontSize: 20,
          color: OG_COLORS.textSecondary,
          letterSpacing: 0.6,
        }}
      >
        {single ? (
          <span style={{ display: "flex" }}>
            {`PEAK +${formatStars(peakDelta)}/d`}
          </span>
        ) : null}
        {single?.repo ? (
          <span style={{ display: "flex" }}>
            {`MOMENTUM ${single.repo.momentumScore.toFixed(2)}`}
          </span>
        ) : null}
        {single && sinceDate ? (
          <span style={{ display: "flex" }}>{`SINCE ${sinceDate}`}</span>
        ) : null}
        {!single ? (
          <span style={{ display: "flex" }}>{`MODE ${mode}`}</span>
        ) : null}
        {!single ? (
          <span style={{ display: "flex" }}>{`SCALE ${scale}`}</span>
        ) : null}
      </div>

      {/* Footer wordmark + URL */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "auto",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 24,
            fontWeight: 700,
            color: OG_COLORS.textPrimary,
          }}
        >
          <StarMark size={24} color={OG_COLORS.brand} />
          <span>TRENDINGREPO</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 18,
            fontFamily: "monospace",
            color: OG_COLORS.textTertiary,
            letterSpacing: 0.5,
          }}
        >
          trendingrepo.com
        </div>
      </div>

      {/* Accent strip */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 8,
          backgroundColor: OG_COLORS.brand,
          display: "flex",
        }}
      />
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = parseQuery(searchParams);

  if ("error" in parsed) {
    const dim = ASPECT_DIMENSIONS.h;
    return new ImageResponse(
      <ErrorCard
        width={dim.width}
        height={dim.height}
        message={parsed.error}
      />,
      {
        ...dim,
        headers: { "Cache-Control": "public, s-maxage=60" },
      },
    );
  }

  const dim = ASPECT_DIMENSIONS[parsed.aspect];
  const bundles = await loadRepos(parsed.repos);
  const seriesBundle = buildAllSeries(
    bundles,
    parsed.mode,
    parsed.scale,
    parsed.metric,
    parsed.window,
    parsed.theme,
  );

  if (parsed.format === "svg") {
    const body = buildSvgDocument(seriesBundle, dim.width, dim.height);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": CACHE_HEADER,
        // Encourage browsers to download rather than render inline when
        // the user clicks the SVG download button. The interactive embed
        // path uses image/svg+xml without this header.
        ...(searchParams.get("download") === "1"
          ? {
              "Content-Disposition": `attachment; filename="star-activity-${todayStamp()}.svg"`,
            }
          : {}),
      },
    });
  }

  // No real series available even after fallback — render the error card so
  // X never gets a broken image. ImageResponse will still emit a valid PNG.
  if (seriesBundle.series.length === 0) {
    return new ImageResponse(
      <ErrorCard
        width={dim.width}
        height={dim.height}
        message="no history yet"
      />,
      {
        ...dim,
        headers: { "Cache-Control": "public, s-maxage=60" },
      },
    );
  }

  return new ImageResponse(
    (
      <StarActivityCard
        bundles={bundles}
        seriesBundle={seriesBundle}
        mode={parsed.mode}
        scale={parsed.scale}
        aspect={parsed.aspect}
        theme={parsed.theme}
        watermark={parsed.watermark}
      />
    ),
    {
      ...dim,
      headers: { "Cache-Control": CACHE_HEADER },
    },
  );
}
