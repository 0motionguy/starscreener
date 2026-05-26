// /api/og/star-history — dedicated Twitter / X share-card renderer that
// embeds the actual star-history curve (not a generic brand card).
//
// Reads the same querystring contract the page uses so a paste-link from
// the page's ShareBar produces a card that matches what the user is
// looking at:
//   ?repo=<owner/name>            primary repo (required)
//   ?cmp=<owner/name,...>         optional compare repos (up to 3)
//   ?window=7d|30d|90d|6m|1y|all  window to crop to (default 30d)
//   ?scale=lin|log                y-axis scale (default lin)
//
// 1200×630 — Twitter `summary_large_image` size. Cached `public, s-maxage=
// 86400, stale-while-revalidate=604800` so X's 7-day OG cache window
// always hits a warm response.
//
// next/og + Satori renders JSX → SVG → PNG. Satori has no Recharts/ECharts
// support, so the chart curve is hand-built as an inline SVG `<path>` with
// monotone-cubic smoothing — same curve family AuroraChart uses, so the
// share card looks identical to the on-site chart.

import { ImageResponse } from "next/og";
import type { ReactElement } from "react";

import { StarMark } from "@/lib/og-primitives";
import { OG_COLORS } from "@/lib/seo";
import {
  filterPayloadByWindow,
  getStarActivity,
  refreshStarActivityFromStore,
  type StarActivityPayload,
  type StarActivityScale,
  type StarActivityWindow,
} from "@/lib/star-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CARD_W = 1200;
const CARD_H = 630;
// 1 day server cache + 7 day SWR so X's aggressive ~7-day OG-image cache
// always hits a warm response — repeat shares of the same URL don't
// regenerate.
const CACHE_HEADER = "public, s-maxage=86400, stale-while-revalidate=604800";

// Chart geometry inside the 1200×630 card.
const CHART = {
  x: 80,
  y: 220,
  w: CARD_W - 160,
  h: 320,
};

const WINDOW_LABEL: Record<StarActivityWindow, string> = {
  "7d": "7-day window",
  "30d": "30-day window",
  "90d": "90-day window",
  "6m": "6-month window",
  "1y": "12-month window",
  all: "lifetime",
};

const VALID_WINDOWS: ReadonlyArray<StarActivityWindow> = ["7d", "30d", "90d", "6m", "1y", "all"];
const VALID_SCALES: ReadonlyArray<StarActivityScale> = ["lin", "log"];

const FULL_NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

const SERIES_COLORS = [
  OG_COLORS.brand,  // primary repo — lava orange
  "#3ad6c5",        // cmp 1 — cyan
  "#a78bfa",        // cmp 2 — violet
  "#22c55e",        // cmp 3 — green
];

// ---------------------------------------------------------------------------
// Param parsing
// ---------------------------------------------------------------------------

function parseRepo(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!FULL_NAME_RE.test(trimmed)) return null;
  return trimmed;
}

function parseCompare(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => parseRepo(s))
    .filter((s): s is string => s !== null)
    .slice(0, 3);
}

function parseWindow(raw: string | null): StarActivityWindow {
  const found = VALID_WINDOWS.find((w) => w === raw);
  return found ?? "30d";
}

function parseScale(raw: string | null): StarActivityScale {
  const found = VALID_SCALES.find((s) => s === raw);
  return found ?? "lin";
}

// ---------------------------------------------------------------------------
// Chart math — project (date, stars) → SVG coords inside CHART box.
// ---------------------------------------------------------------------------

interface ChartPoint { x: number; y: number; ms: number; s: number; }
interface ProjectedSeries {
  name: string;
  color: string;
  coords: ChartPoint[];
  last: ChartPoint | null;
  delta: number;
  current: number;
}

function project(
  serieses: Array<{ name: string; color: string; points: Array<{ d: string; s: number }> }>,
  scale: StarActivityScale,
): { all: ProjectedSeries[]; xMin: number; xMax: number; yMin: number; yMax: number } {
  // Collect global x range across all series so they share an axis.
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMinRaw = Infinity;
  let yMaxRaw = -Infinity;
  const series = serieses.map((s) => {
    const stripped = s.points.map((p) => ({
      ms: Date.parse(`${p.d}T00:00:00Z`),
      s: p.s,
    }));
    for (const p of stripped) {
      if (p.ms < xMin) xMin = p.ms;
      if (p.ms > xMax) xMax = p.ms;
      if (p.s < yMinRaw) yMinRaw = p.s;
      if (p.s > yMaxRaw) yMaxRaw = p.s;
    }
    return { ...s, stripped };
  });
  if (!Number.isFinite(xMin)) xMin = Date.now() - 30 * 86_400_000;
  if (!Number.isFinite(xMax)) xMax = Date.now();
  if (xMin === xMax) xMax = xMin + 86_400_000;
  if (!Number.isFinite(yMinRaw)) yMinRaw = 0;
  if (!Number.isFinite(yMaxRaw)) yMaxRaw = 1;
  if (yMinRaw === yMaxRaw) yMaxRaw = yMinRaw + 1;

  const yMin = scale === "log" ? Math.log10(Math.max(1, yMinRaw)) : yMinRaw;
  const yMaxLifted = scale === "log" ? Math.log10(Math.max(1, yMaxRaw)) : yMaxRaw + (yMaxRaw - yMinRaw) * 0.08;
  const yRange = Math.max(1e-9, yMaxLifted - yMin);
  const xRange = xMax - xMin || 1;

  const all: ProjectedSeries[] = series.map((s) => {
    const coords: ChartPoint[] = s.stripped.map((p) => {
      const x = CHART.x + ((p.ms - xMin) / xRange) * CHART.w;
      const vScaled = scale === "log" ? Math.log10(Math.max(1, p.s)) : p.s;
      const y = CHART.y + CHART.h - ((vScaled - yMin) / yRange) * CHART.h;
      return { x, y, ms: p.ms, s: p.s };
    });
    const first = coords[0];
    const last = coords[coords.length - 1] ?? null;
    const delta = first && last ? last.s - first.s : 0;
    const current = last?.s ?? 0;
    return { name: s.name, color: s.color, coords, last, delta, current };
  });

  return { all, xMin, xMax, yMin: yMinRaw, yMax: yMaxRaw };
}

// Smooth cubic-Bezier path (Catmull-Rom 1/6 tangent rule) — matches the
// AuroraChart monotone-cubic curve used on the live page.
function buildSmoothPath(coords: ChartPoint[]): string {
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`;
  const parts: string[] = [`M${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`];
  for (let i = 0; i < coords.length - 1; i += 1) {
    const p0 = coords[i - 1] ?? coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] ?? coords[i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    parts.push(
      `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`,
    );
  }
  return parts.join(" ");
}

function buildAreaPath(coords: ChartPoint[]): string {
  if (coords.length === 0) return "";
  const line = buildSmoothPath(coords);
  const last = coords[coords.length - 1];
  const first = coords[0];
  const baseY = CHART.y + CHART.h;
  return `${line} L${last.x.toFixed(2)},${baseY.toFixed(2)} L${first.x.toFixed(2)},${baseY.toFixed(2)} Z`;
}

function formatStars(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function formatDelta(n: number): string {
  if (n === 0) return "±0";
  const abs = Math.abs(n);
  const compact = formatStars(abs);
  return n > 0 ? `+${compact}` : `−${compact}`;
}

// ---------------------------------------------------------------------------
// Card composition
// ---------------------------------------------------------------------------

interface CardInput {
  primary: string;
  cmp: string[];
  window: StarActivityWindow;
  scale: StarActivityScale;
  payloads: Map<string, StarActivityPayload>;
}

function renderCard({
  primary,
  cmp,
  window,
  scale,
  payloads,
}: CardInput): ReactElement {
  const allNames = [primary, ...cmp];
  const projInput = allNames
    .map((name, idx) => {
      const payload = payloads.get(name.toLowerCase());
      if (!payload) return null;
      const filtered = filterPayloadByWindow(payload, window);
      const points = filtered.points.map((p) => ({ d: p.d, s: p.s }));
      if (points.length < 2) return null;
      return {
        name,
        color: SERIES_COLORS[idx % SERIES_COLORS.length],
        points,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const { all } = project(projInput, scale);
  const primarySeries = all[0] ?? null;

  const titleText = cmp.length > 0
    ? `${primary} vs ${cmp.join(", ")}`
    : primary;

  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        display: "flex",
        flexDirection: "column",
        background: "#08090a",
        backgroundImage:
          "radial-gradient(120% 80% at 0% 0%, rgba(255,107,53,0.18), transparent 55%)," +
          " radial-gradient(110% 80% at 100% 100%, rgba(58,214,197,0.10), transparent 60%)",
        fontFamily: "sans-serif",
        color: "#e6e6e6",
        position: "relative",
      }}
    >
      {/* Top strip — brand on the left, window pill on the right */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "32px 64px 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <StarMark size={28} color={OG_COLORS.brand} />
          <span style={{ fontSize: 24, fontWeight: 700, color: "#e6e6e6", letterSpacing: -0.3 }}>
            trending<span style={{ color: OG_COLORS.brand }}>.</span>repo
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 14px",
            border: "1px solid rgba(255,107,53,0.45)",
            background: "rgba(255,107,53,0.10)",
            borderRadius: 999,
            fontSize: 16,
            color: OG_COLORS.brand,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 1.2,
          }}
        >
          ★ {WINDOW_LABEL[window]}
        </div>
      </div>

      {/* Title + headline stats */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "24px 64px 12px",
          gap: 6,
        }}
      >
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: -1.5,
            lineHeight: 1.05,
            // Clip the title manually — Satori has no overflow:hidden text-overflow,
            // so we eyeball the safe length and trust the page-level truncation
            // of `primary`/`cmp` (validated by FULL_NAME_RE above).
            maxWidth: CARD_W - 128,
          }}
        >
          {titleText.length > 48 ? `${titleText.slice(0, 46)}…` : titleText}
        </div>
        {primarySeries ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 4 }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: OG_COLORS.brand }}>
              ★ {formatStars(primarySeries.current)}
            </span>
            <span
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: primarySeries.delta >= 0 ? "#22c55e" : "#ef4444",
              }}
            >
              {formatDelta(primarySeries.delta)} stars
            </span>
            <span style={{ fontSize: 18, color: "#909caa" }}>
              over {WINDOW_LABEL[window]}
            </span>
          </div>
        ) : (
          <div style={{ fontSize: 22, color: "#909caa", marginTop: 4 }}>
            star history backfilling
          </div>
        )}
      </div>

      {/* The chart canvas — pure SVG so Satori can paint it directly. */}
      <svg
        width={CARD_W}
        height={CHART.y + CHART.h + 20}
        viewBox={`0 0 ${CARD_W} ${CHART.y + CHART.h + 20}`}
        style={{ position: "absolute", left: 0, top: 0 }}
      >
        {/* Faint horizontal gridlines */}
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={CHART.x}
            x2={CHART.x + CHART.w}
            y1={CHART.y + CHART.h * t}
            y2={CHART.y + CHART.h * t}
            stroke="rgba(255,255,255,0.07)"
            strokeDasharray="3 6"
            strokeWidth={1}
          />
        ))}
        {/* Baseline */}
        <line
          x1={CHART.x}
          x2={CHART.x + CHART.w}
          y1={CHART.y + CHART.h}
          y2={CHART.y + CHART.h}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1}
        />
        {/* Series — areas first, then strokes on top */}
        {all.map((s, i) => (
          <path
            key={`a-${i}`}
            d={buildAreaPath(s.coords)}
            fill={s.color}
            fillOpacity={i === 0 ? 0.18 : 0.08}
          />
        ))}
        {all.map((s, i) => (
          <path
            key={`l-${i}`}
            d={buildSmoothPath(s.coords)}
            fill="none"
            stroke={s.color}
            strokeWidth={i === 0 ? 3.5 : 2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {/* Endpoint dots */}
        {all.map((s, i) =>
          s.last ? (
            <g key={`d-${i}`}>
              <circle
                cx={s.last.x}
                cy={s.last.y}
                r={i === 0 ? 8 : 5}
                fill={s.color}
                stroke="#08090a"
                strokeWidth={2}
              />
              {i === 0 ? (
                <circle
                  cx={s.last.x}
                  cy={s.last.y}
                  r={16}
                  fill={s.color}
                  fillOpacity={0.22}
                />
              ) : null}
            </g>
          ) : null,
        )}
      </svg>

      {/* Footer — series legend on the left, domain on the right */}
      <div
        style={{
          marginTop: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 64px 36px",
          fontSize: 17,
          color: "#909caa",
        }}
      >
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
          {all.map((s, i) => (
            <div key={`leg-${i}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  background: s.color,
                  borderRadius: 3,
                  display: "flex",
                }}
              />
              <span style={{ color: "#e6e6e6", fontWeight: 600 }}>{s.name}</span>
              <span style={{ color: "#909caa" }}>{formatStars(s.current)}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: OG_COLORS.brand, fontWeight: 600 }}>
          trendingrepo.com / tools / star-history
        </div>
      </div>
    </div>
  );
}

function renderFallback(reason: string): ReactElement {
  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#08090a",
        backgroundImage: "radial-gradient(120% 80% at 50% 0%, rgba(255,107,53,0.18), transparent 60%)",
        fontFamily: "sans-serif",
        color: "#e6e6e6",
        gap: 22,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <StarMark size={44} color={OG_COLORS.brand} />
        <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -0.5 }}>
          trending<span style={{ color: OG_COLORS.brand }}>.</span>repo
        </span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 600 }}>Star history</div>
      <div style={{ fontSize: 18, color: "#909caa" }}>{reason}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);

  // Accept both `repo=` (page-style) and `repos=` (ShareBar-style) — the
  // first comma-separated entry becomes the primary, the rest become cmp.
  let primary = parseRepo(searchParams.get("repo"));
  let cmp = parseCompare(searchParams.get("cmp"));
  const reposParam = searchParams.get("repos");
  if (!primary && reposParam) {
    const list = parseCompare(reposParam);
    primary = list[0] ?? null;
    cmp = list.slice(1);
  }

  if (!primary) {
    return new ImageResponse(renderFallback("paste an owner/name to preview"), {
      width: CARD_W,
      height: CARD_H,
      headers: { "Cache-Control": CACHE_HEADER },
    });
  }

  const window = parseWindow(searchParams.get("window"));
  const scale = parseScale(searchParams.get("scale"));

  // Fetch payloads for every series in parallel.
  const allNames = [primary, ...cmp];
  const payloads = new Map<string, StarActivityPayload>();
  await Promise.all(
    allNames.map(async (fullName) => {
      try {
        await refreshStarActivityFromStore(fullName);
        const payload = getStarActivity(fullName);
        if (payload && payload.points.length > 0) {
          payloads.set(fullName.toLowerCase(), payload);
        }
      } catch {
        // Best-effort — missing payloads degrade to "backfilling" copy.
      }
    }),
  );

  return new ImageResponse(
    renderCard({ primary, cmp, window, scale, payloads }),
    {
      width: CARD_W,
      height: CARD_H,
      headers: { "Cache-Control": CACHE_HEADER },
    },
  );
}
