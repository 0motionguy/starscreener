// Canonical chart kind: smooth cumulative-stars area-line chart, supports
// 1–4 series on a single time axis. The VISUAL variety on /tools/star-history
// comes from the registered ECharts themes in src/lib/charts/public-themes.ts
// — we deliberately do NOT hard-code colors here so each series gets painted
// from the active theme's palette.
//
// Multi-series uses `xAxis: { type: "time" }` so each repo's points can have
// its own date range — no need to union categories across repos and pad with
// nulls. ECharts handles the alignment.
//
// POSTER + SKETCH on the page are special SVG compositions (not ECharts) so
// they're handled in page.tsx / SketchArt.tsx, not here.

import type { StarActivityPayload, StarActivityScale } from "@/lib/star-activity-shared";

type EOption = Record<string, unknown>;

/** One repo's contribution to a multi-series chart. */
export interface ChartSeriesInput {
  /** Display name shown in legend + markPoint label (e.g. "vercel/next.js"). */
  name: string;
  payload: StarActivityPayload;
}

interface BuildInput {
  /** 1+ series, painted in order with the theme's palette. */
  series: ReadonlyArray<ChartSeriesInput>;
  scale: StarActivityScale;
}

function fmtStars(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// "2026-04-24" → "Apr 24" (used when ECharts hands us a YYYY-MM-DD bucket
// string for category axes — kept for tooltip date display).
function formatBucketDate(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  const monthIdx = Math.max(0, Math.min(11, parseInt(m[2], 10) - 1));
  const day = parseInt(m[3], 10);
  return `${MONTH_ABBR[monthIdx]} ${day}`;
}

// Convert a "YYYY-MM-DD" bucket → epoch ms (UTC midnight). ECharts time axis
// wants numeric or Date — we hand it numbers so JSON serialization is cheap.
function bucketToEpoch(d: string): number {
  return Date.parse(`${d}T00:00:00Z`);
}

export function buildAreaOption({ series, scale }: BuildInput): EOption {
  if (series.length === 0) {
    return { series: [] };
  }

  // Convert each series to [epochMs, stars] pairs once.
  const eseries = series.map((s) => ({
    name: s.name,
    pts: s.payload.points.map((p) => [bucketToEpoch(p.d), p.s] as [number, number]),
  }));

  // Per-series last point — drives the end markPoint.
  const lastByName = new Map<string, [number, number]>();
  for (const s of eseries) {
    if (s.pts.length > 0) lastByName.set(s.name, s.pts[s.pts.length - 1]);
  }

  const isMulti = series.length > 1;

  return {
    // Top room for the legend when multi; right room so end markers don't
    // touch the frame; bottom room for X axis labels.
    grid: {
      top: isMulti ? 44 : 28,
      right: 64,
      bottom: 36,
      left: 64,
    },
    legend: isMulti
      ? {
          show: true,
          top: 6,
          icon: "roundRect",
          itemWidth: 10,
          itemHeight: 10,
          itemGap: 18,
          textStyle: { fontSize: 11 },
          data: series.map((s) => s.name),
        }
      : { show: false },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const arr = params as Array<{
          seriesName: string;
          data: [number, number];
          color: string;
        }>;
        if (arr.length === 0) return "";
        const ts = arr[0].data[0];
        const headerDate = formatBucketDate(new Date(ts).toISOString().slice(0, 10));
        const rows = arr
          .map(
            (p) =>
              `<div style="display:flex;align-items:center;gap:6px;">` +
              `<span style="display:inline-block;width:8px;height:8px;background:${p.color};border-radius:2px;"></span>` +
              `<span style="opacity:0.7;">${p.seriesName}</span>` +
              `<b style="margin-left:auto;">${fmtStars(p.data[1])}</b>` +
              `</div>`,
          )
          .join("");
        return `<b>${headerDate}</b><div style="margin-top:4px;display:grid;gap:3px;min-width:160px;">${rows}</div>`;
      },
    },
    xAxis: {
      type: "time",
      boundaryGap: false,
      axisLabel: {
        hideOverlap: true,
        formatter: (ts: number) => {
          const iso = new Date(ts).toISOString().slice(0, 10);
          return formatBucketDate(iso);
        },
      },
    },
    yAxis: {
      type: scale === "log" ? "log" : "value",
      logBase: 10,
      axisLabel: { formatter: (v: number) => fmtStars(v) },
      scale: scale === "log",
      max: scale === "log" ? undefined : "dataMax",
    },
    series: eseries.map((s, i) => {
      const last = lastByName.get(s.name);
      return {
        name: s.name,
        type: "line" as const,
        smooth: 0.45,
        smoothMonotone: "x" as const,
        symbol: "none",
        sampling: "lttb",
        data: s.pts,
        lineStyle: { width: 2.4, cap: "round" as const, join: "round" as const },
        // Area fill only when single-series — multi-line area stacks would
        // muddle the colors and obscure the lines underneath.
        areaStyle: isMulti
          ? undefined
          : { opacity: 0.18, origin: "start" as const },
        // Per-series end marker. Only one label position used (top) — we
        // accept that markers on close-valued series may overlap; the legend
        // disambiguates.
        markPoint: last
          ? {
              symbol: "circle",
              symbolSize: 9,
              itemStyle: { borderWidth: 2 },
              label: {
                formatter: fmtStars(last[1]),
                position: "top" as const,
                fontWeight: 700,
                fontSize: 11,
                padding: [3, 6],
                borderWidth: 1,
                borderRadius: 2,
              },
              data: [{ name: `current-${i}`, coord: last }],
            }
          : undefined,
      };
    }),
  };
}

export const buildOption = buildAreaOption;

export type ChartKind = "area";
