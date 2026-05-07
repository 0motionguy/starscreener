"use client";

// Stacked area chart + per-source rail for the cross-source signal volume
// panel. Receives 24 hourly buckets from src/lib/signals/volume.ts and
// renders each source as its own coloured area.
//
// The main 24h chart is migrated to the shared <EChart> wrapper (canvas-
// rendered ECharts) — same brand colours, same total silhouette, same peak
// marker, but tree-shaken with the rest of the dashboard.
//
// The rail BELOW the chart stays as inline SVG: 8 mini sparklines is a row
// of presentational glyphs, not a chart — spinning up an ECharts instance
// per source would burn an order of magnitude more memory for no gain. The
// rail exists because one source (Reddit, typically) can dominate ~95% of
// total volume and visually crush the other 7 areas; the rail surfaces
// every source's individual shape, count, and within-window momentum so
// no source is hidden.
//
// External props are unchanged from the SVG version (1:1 contract).

import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";

import { Card, CardHeader } from "@/components/ui/Card";
import { ChartStat, ChartStats, ChartWrap } from "@/components/ui/ChartShell";
import { EChart } from "@/components/charts/EChart";
import { CHART_TOKENS } from "@/lib/charts/theme";
import type { HourBucket } from "@/lib/signals/volume";
import type { SourceKey } from "@/lib/signals/types";
import { SourceMark, SOURCE_BRAND_COLOR } from "./SourceMark";

type VolumeSourceKey = Exclude<keyof HourBucket, "hour" | "total">;

// SOURCES: stack order (bottom → top) and tooltip order. The colour values
// here are the *display* colours used by the inline rail; the ECharts series
// uses CHART_TOKENS for canvas-safe literals (CSS custom properties don't
// survive the canvas rendering boundary — see comment in theme.ts).
const SOURCES: Array<{
  key: VolumeSourceKey;
  src: SourceKey;
  label: string;
  /** CSS variable for DOM rendering (rail). */
  cssVar: string;
  /** Literal hex for canvas (ECharts). */
  hex: string;
}> = [
  { key: "hn",      src: "hn",      label: "HN",      cssVar: "var(--source-hackernews)", hex: "#ff6600" },
  { key: "github",  src: "github",  label: "GitHub",  cssVar: "var(--source-github)",     hex: "#f0f6fc" },
  { key: "x",       src: "x",       label: "X",       cssVar: "var(--source-x)",          hex: "#1d9bf0" },
  { key: "reddit",  src: "reddit",  label: "Reddit",  cssVar: "var(--source-reddit)",     hex: "#ff4500" },
  { key: "bluesky", src: "bluesky", label: "Bluesky", cssVar: "var(--source-bluesky)",    hex: "#0085ff" },
  { key: "devto",   src: "devto",   label: "Dev.to",  cssVar: "var(--source-dev)",        hex: "#000000" },
  { key: "claude",  src: "claude",  label: "Claude",  cssVar: "var(--source-claude)",     hex: "#cc785c" },
  { key: "openai",  src: "openai",  label: "OpenAI",  cssVar: "var(--source-openai)",     hex: "#10a37f" },
];

const SOURCE_NAMES: Record<SourceKey, string> = {
  hn: "Hacker News",
  github: "GitHub",
  x: "X / Twitter",
  reddit: "Reddit",
  bluesky: "Bluesky",
  devto: "Dev.to",
  claude: "Claude RSS",
  openai: "OpenAI RSS",
};

function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

function compactNumber(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// Mini-sparkline (rail row) — 24 hourly counts → small SVG path.
const RAIL_W = 78;
const RAIL_H = 18;

function buildSparkline(values: number[]): {
  line: string;
  fill: string;
  lastX: number;
  lastY: number;
} {
  if (values.length === 0) {
    return { line: "", fill: "", lastX: 0, lastY: RAIL_H };
  }
  const max = Math.max(...values, 1);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const x = (i / Math.max(1, values.length - 1)) * (RAIL_W - 2) + 1;
    const y = RAIL_H - 1 - (values[i] / max) * (RAIL_H - 3);
    xs.push(x);
    ys.push(y);
  }
  const line = xs
    .map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`)
    .join(" ");
  const fill = `${line} L${xs[xs.length - 1].toFixed(1)},${RAIL_H} L${xs[0].toFixed(1)},${RAIL_H} Z`;
  return { line, fill, lastX: xs[xs.length - 1], lastY: ys[ys.length - 1] };
}

// Within-window momentum: compare second half vs first half of the
// 24-bucket array. Returns signed % change. Null when too sparse.
function momentumPct(values: number[]): number | null {
  if (values.length < 4) return null;
  const half = Math.floor(values.length / 2);
  let first = 0;
  let second = 0;
  for (let i = 0; i < half; i++) first += values[i];
  for (let i = half; i < values.length; i++) second += values[i];
  if (first === 0 && second === 0) return null;
  if (first === 0) return 100;
  return Math.round(((second - first) / first) * 100);
}

interface AxisTooltipParam {
  axisValue: string;
  seriesName: string;
  value: number;
  color: string;
  seriesIndex: number;
}

export interface VolumeAreaChartProps {
  buckets: HourBucket[];
  totalItems: number;
  changePct: number | null;
  peakHour: number;
  peakTotal: number;
  quietHour: number;
  quietTotal: number;
  dominantSource: SourceKey;
  dominantPct: number;
}

export function VolumeAreaChart({
  buckets,
  totalItems,
  changePct,
  peakHour,
  peakTotal,
  quietHour,
  quietTotal,
  dominantSource,
  dominantPct,
}: VolumeAreaChartProps) {
  const deltaText =
    changePct === null ? "Δ N/A" : `Δ ${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%`;

  // Per-source rail data: hourly array + 24h total + within-window momentum.
  const railRows = SOURCES.map((s) => {
    const values = buckets.map((b) => b[s.key]);
    const total = values.reduce((sum, v) => sum + v, 0);
    return {
      ...s,
      values,
      total,
      momentum: momentumPct(values),
    };
  });

  // Derived indicators.
  // Source spread = how many sources contributed > 5% of the total.
  const sourceSpread = totalItems > 0
    ? railRows.filter((r) => r.total / totalItems > 0.05).length
    : 0;
  // Window-wide momentum (sum of all sources) — same first-vs-second-half logic.
  const totals = buckets.map((b) => b.total);
  const overallMomentum = momentumPct(totals);

  // ECharts option for the main 24h stacked area. Memoised on the bucket
  // array reference; <EChart> uses notMerge=true so a fresh option fully
  // replaces prior series state.
  const option = useMemo<EChartsCoreOption | null>(() => {
    if (buckets.length === 0) return null;

    const hourLabels = buckets.map((b) => formatHour(b.hour));
    const peakLabel = formatHour(peakHour);

    const stackSeries = SOURCES.map((s) => ({
      type: "line" as const,
      name: s.label,
      stack: "volume",
      smooth: false,
      symbol: "none" as const,
      sampling: "lttb" as const,
      data: buckets.map((b) => b[s.key]),
      lineStyle: { width: 1, color: s.hex },
      itemStyle: { color: s.hex },
      areaStyle: {
        color: {
          type: "linear" as const,
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: hexWithAlpha(s.hex, 0.85) },
            { offset: 1, color: hexWithAlpha(s.hex, 0.35) },
          ],
        },
      },
      emphasis: { focus: "series" as const },
      animationDuration: 0,
    }));

    // Total silhouette — keeps the overall shape visible even when one
    // source dominates 95% of volume. Not stacked; rendered above the areas.
    const totalSeries = {
      type: "line" as const,
      name: "Total",
      smooth: false,
      symbol: "none" as const,
      data: buckets.map((b) => b.total),
      lineStyle: { width: 1.4, color: CHART_TOKENS.textDefault, opacity: 0.85 },
      itemStyle: { color: CHART_TOKENS.textDefault },
      areaStyle: undefined,
      // Total is presented via the silhouette line only; tooltip shows it
      // explicitly so we hide the legend mark.
      tooltip: { show: false },
      z: 10,
      animationDuration: 0,
    };

    return {
      animationDuration: 0,
      grid: { top: 16, right: 14, bottom: 28, left: 44, containLabel: false },
      xAxis: {
        type: "category",
        data: hourLabels,
        boundaryGap: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: CHART_TOKENS.textSubtle,
          fontSize: 10,
          interval: 3,
          formatter: (value: string) => value.toUpperCase(),
        },
      },
      yAxis: {
        type: "value",
        min: 0,
        axisLabel: {
          color: CHART_TOKENS.textSubtle,
          fontSize: 10,
          formatter: (value: number) => String(Math.round(value)),
        },
        splitLine: {
          show: true,
          lineStyle: { color: "rgba(255,255,255,0.06)", type: "solid" },
        },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "line",
          lineStyle: {
            color: CHART_TOKENS.borderDefault,
            type: "dashed",
            width: 1,
          },
        },
        formatter: (params: AxisTooltipParam | AxisTooltipParam[]) => {
          const list = Array.isArray(params) ? params : [params];
          if (list.length === 0) return "";
          const hourLabel = list[0].axisValue;
          // Sum visible series (excluding the Total silhouette) to get the
          // bucket total. Walk SOURCES in stack order so the tooltip rows
          // match the legend.
          const sourceRows = SOURCES.map((s, idx) => {
            const param = list.find((p) => p.seriesIndex === idx);
            const count = param ? Math.round(param.value) : 0;
            if (count === 0) return null;
            return `
              <li style="display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:10px;font-family:var(--font-mono),monospace;">
                <span style="display:inline-flex;align-items:center;gap:6px;color:${CHART_TOKENS.textSubtle};">
                  <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${s.hex};${s.key === "devto" ? "border:1px solid #fff;" : ""}"></span>
                  ${s.label}
                </span>
                <span style="color:${CHART_TOKENS.textDefault};font-variant-numeric:tabular-nums;">${count}</span>
              </li>`;
          }).filter(Boolean);
          const total = SOURCES.reduce((acc, _, idx) => {
            const param = list.find((p) => p.seriesIndex === idx);
            return acc + (param ? Math.round(param.value) : 0);
          }, 0);
          return `
            <div style="min-width:180px;font-family:var(--font-mono),monospace;">
              <div style="font-size:11px;color:${CHART_TOKENS.textFaint};margin-bottom:6px;">${hourLabel} UTC</div>
              <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid ${CHART_TOKENS.borderDefault};">
                <span style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:${CHART_TOKENS.textFaint};">Total</span>
                <span style="font-size:12px;color:${CHART_TOKENS.textDefault};font-variant-numeric:tabular-nums;">${total}</span>
              </div>
              ${
                sourceRows.length === 0
                  ? `<div style="font-size:10px;color:${CHART_TOKENS.textFaint};font-style:italic;">no signals this hour</div>`
                  : `<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:2px;">${sourceRows.join("")}</ul>`
              }
            </div>
          `;
        },
      },
      series: [
        ...stackSeries,
        totalSeries,
        // Peak hour marker — drawn as a dashed vertical line via a zero-data
        // line series carrying a markLine. ECharts has no top-level markLine,
        // so we attach to a hidden series.
        ...(peakTotal > 0
          ? [
              {
                type: "line" as const,
                name: "Peak",
                data: [],
                tooltip: { show: false },
                markLine: {
                  silent: true,
                  symbol: "none",
                  lineStyle: {
                    color: CHART_TOKENS.accent,
                    type: "dashed" as const,
                    opacity: 0.75,
                    width: 1,
                  },
                  label: {
                    formatter: `PEAK ${peakTotal}`,
                    color: CHART_TOKENS.accent,
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                    fontSize: 10,
                    position: "insideEndTop" as const,
                    distance: 6,
                  },
                  data: [{ xAxis: peakLabel }],
                  animationDuration: 0,
                },
                animationDuration: 0,
              },
            ]
          : []),
      ],
    };
  }, [buckets, peakHour, peakTotal]);

  return (
    <Card variant="panel" className="signals-panel">
      <CardHeader
        showCorner
        right={
          <>
            <span>{deltaText}</span>
            <span className="live">LIVE</span>
          </>
        }
      >
        <span>{"// 01 SIGNAL VOLUME"}</span>
        <span style={{ color: "var(--color-text-subtle)", marginLeft: "8px" }}>
          · STACKED · 24H · BY SOURCE
        </span>
      </CardHeader>

      <ChartWrap variant="chart" style={{ minHeight: 220 }}>
        {option ? (
          <EChart
            option={option}
            height={220}
            ariaLabel="24 hour signal volume stacked by source"
          />
        ) : null}
      </ChartWrap>

      {/* Per-source rail — every source surfaces its own shape, count, and
          within-window momentum even when stacked-area is dominated by one. */}
      <div className="vol-rail">
        {railRows.map((r) => {
          const { line, fill, lastX, lastY } = buildSparkline(r.values);
          const sharePct = totalItems > 0 ? (r.total / totalItems) * 100 : 0;
          const mom = r.momentum;
          const momText =
            mom === null ? "—" : `${mom >= 0 ? "+" : ""}${mom}%`;
          const momColor =
            mom === null
              ? "var(--color-text-faint)"
              : mom > 0
                ? "var(--color-positive)"
                : mom < 0
                  ? "var(--color-negative)"
                  : "var(--color-text-subtle)";
          return (
            <div key={r.key} className="vol-rail-row">
              <span
                className="vol-rail-mark"
                style={{
                  background: `color-mix(in srgb, ${SOURCE_BRAND_COLOR[r.src]} 22%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${SOURCE_BRAND_COLOR[r.src]} 55%, transparent)`,
                  color: SOURCE_BRAND_COLOR[r.src],
                }}
              >
                <SourceMark source={r.src} size={11} monochrome />
              </span>
              <span className="vol-rail-label">{r.label}</span>
              <span className="vol-rail-count">{compactNumber(r.total)}</span>
              <span className="vol-rail-share">{sharePct.toFixed(1)}%</span>
              <span className="vol-rail-mom" style={{ color: momColor }}>
                {momText}
              </span>
              <svg
                className="vol-rail-spark"
                viewBox={`0 0 ${RAIL_W} ${RAIL_H}`}
                preserveAspectRatio="none"
                aria-hidden
              >
                {fill ? (
                  <path
                    d={fill}
                    fill={`color-mix(in srgb, ${SOURCE_BRAND_COLOR[r.src]} 28%, transparent)`}
                    stroke="none"
                  />
                ) : null}
                {line ? (
                  <path
                    d={line}
                    fill="none"
                    stroke={SOURCE_BRAND_COLOR[r.src]}
                    strokeWidth={1.3}
                  />
                ) : null}
                {line && r.total > 0 ? (
                  <circle
                    cx={lastX.toFixed(1)}
                    cy={lastY.toFixed(1)}
                    r={1.8}
                    fill={SOURCE_BRAND_COLOR[r.src]}
                    stroke="var(--color-bg-shell)"
                    strokeWidth={0.8}
                  />
                ) : null}
              </svg>
            </div>
          );
        })}
      </div>

      <ChartStats columns={6}>
        <ChartStat
          label="Peak hour"
          value={`${formatHour(peakHour)} UTC`}
          sub={`${peakTotal.toLocaleString("en-US")} signals`}
        />
        <ChartStat
          label="Quietest"
          value={`${formatHour(quietHour)} UTC`}
          sub={`${quietTotal.toLocaleString("en-US")} signals`}
        />
        <ChartStat
          label="Dominant source"
          value={SOURCE_NAMES[dominantSource]}
          sub={
            <span style={{ color: SOURCE_BRAND_COLOR[dominantSource] }}>
              {dominantPct.toFixed(1)}% of total
            </span>
          }
        />
        <ChartStat
          label="Hourly velocity"
          value={`${peakTotal}/h`}
          sub="at peak hour"
        />
        <ChartStat
          label="Source spread"
          value={`${sourceSpread} / 8`}
          sub=">5% share"
        />
        <ChartStat
          label="Momentum"
          value={
            <span
              style={{
                color:
                  overallMomentum === null
                    ? "var(--color-text-faint)"
                    : overallMomentum > 0
                      ? "var(--color-positive)"
                      : overallMomentum < 0
                        ? "var(--color-negative)"
                        : "var(--color-text-default)",
              }}
            >
              {overallMomentum === null
                ? "—"
                : `${overallMomentum >= 0 ? "+" : ""}${overallMomentum}%`}
            </span>
          }
          sub="2nd half vs 1st"
        />
      </ChartStats>

      <span style={{ display: "none" }}>{totalItems}</span>
    </Card>
  );
}

/** Convert #rrggbb / #rgb to rgba(r,g,b,alpha). Falls back to the input
 *  string if it doesn't parse so callers (canvas) still get *something*
 *  drawable instead of a blank fill. */
function hexWithAlpha(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "");
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return hex;
}

export default VolumeAreaChart;
