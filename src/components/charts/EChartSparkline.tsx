"use client";

// Mini-mode sparkline rendered through the shared <EChart> wrapper.
//
// Replaces the hand-rolled inline-SVG `<Sparkline>` functions that were
// duplicated in src/app/page.tsx, src/app/githubrepo/page.tsx, and
// src/components/home/LiveTopTable.tsx. Three visible upgrades vs the
// inline SVG version:
//   1. canvas anti-aliased line (smoother edges at small sizes)
//   2. animated draw on first paint (1.2s easeOutCubic)
//   3. hover tooltip showing the exact value at that point — first time
//      these tiny sparklines are interactive
//
// Defaults bumped from 72×24 to 84×28 (~16% larger) so the visible heft
// shifts noticeably between the old and new charts. Callers that need a
// specific width can still pass it through.

import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";

import { EChart } from "./EChart";
import { CHART_TOKENS } from "@/lib/charts/theme";

export interface EChartSparklineProps {
  /** Numeric series. Two-or-more points required to render a line. */
  values: number[];
  /** CSS class on the wrapping div (parity with the old <Sparkline>). */
  className?: string;
  /**
   * Stroke / area-fill base color. Accepts a CSS color or a
   * `var(--token)` reference. Defaults to brand accent (Liquid Lava).
   */
  color?: string;
  /** Default 84. */
  width?: number;
  /** Default 28. */
  height?: number;
  /** When true, fills the area under the line with a fading gradient. */
  area?: boolean;
  /**
   * When set, the tooltip uses this label for the value; for example:
   * "stars" renders as "12,345 stars". Defaults to bare numeric value.
   */
  tooltipLabel?: string;
}

const DEFAULT_W = 84;
const DEFAULT_H = 28;

/**
 * Resolve a color prop to a literal canvas-safe string. Canvas can't read
 * CSS custom properties at paint time, so var(--…) values fall back to
 * the brand accent literal — matches the inline-SVG version's `var(--acc,
 * #ff6a00)` fallback pattern.
 */
function resolveColor(input: string | undefined): string {
  if (!input) return CHART_TOKENS.accent;
  if (input.startsWith("var(")) {
    // Heuristic mapping for the small set of accent vars actually used in
    // the codebase. Anything else falls through to brand accent.
    if (input.includes("--sig-red")) return CHART_TOKENS.negative;
    if (input.includes("--sig-cyan")) return CHART_TOKENS.cyan;
    if (input.includes("--sig-green")) return CHART_TOKENS.positive;
    if (input.includes("--sig-yellow") || input.includes("--warning"))
      return CHART_TOKENS.warning;
    return CHART_TOKENS.accent;
  }
  return input;
}

/**
 * Convert a hex like #ff6b35 to an `r, g, b` substring usable in
 * `rgba(${rgb}, 0.4)`. Returns the brand accent triple if parsing fails.
 */
function hexToRgbTriple(hex: string): string {
  if (!hex.startsWith("#")) return "255, 107, 53";
  const h = hex.slice(1);
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6) return "255, 107, 53";
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (!Number.isFinite(r + g + b)) return "255, 107, 53";
  return `${r}, ${g}, ${b}`;
}

export function EChartSparkline({
  values,
  className,
  color,
  width = DEFAULT_W,
  height = DEFAULT_H,
  area = true,
  tooltipLabel,
}: EChartSparklineProps) {
  const safeValues = useMemo(
    () => values.filter((v) => Number.isFinite(v)),
    [values],
  );

  const stroke = resolveColor(color);
  const rgb = hexToRgbTriple(stroke);

  const option = useMemo<EChartsCoreOption | null>(() => {
    if (safeValues.length < 2) return null;

    const data = safeValues.map((v, i) => [i, v] as [number, number]);
    const lastIdx = safeValues.length - 1;
    const lastVal = safeValues[lastIdx];

    return {
      // Pin grid to the canvas edges — every pixel goes to the line.
      grid: { top: 2, right: 2, bottom: 2, left: 2, containLabel: false },
      // Numeric category-style x; we don't show axes so type doesn't matter
      // visually. Setting them lets ECharts compute a tight range without
      // padding labels.
      xAxis: {
        type: "value",
        show: false,
        min: 0,
        max: lastIdx,
      },
      yAxis: {
        type: "value",
        show: false,
        scale: true,
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "none" },
        formatter: (params: { value: [number, number] }[]) => {
          const point = params[0];
          if (!point) return "";
          const v = point.value[1];
          const label = tooltipLabel
            ? `<span style="color:${CHART_TOKENS.textSubtle};font-size:10px;text-transform:uppercase;letter-spacing:0.06em;">${tooltipLabel}</span>`
            : "";
          return `<div style="font-family:var(--font-mono),monospace;font-size:11px;color:${CHART_TOKENS.textDefault};display:flex;gap:6px;align-items:center;font-variant-numeric:tabular-nums;">${label}${v.toLocaleString()}</div>`;
        },
      },
      series: [
        {
          type: "line",
          data,
          showSymbol: false,
          smooth: true,
          symbol: "circle",
          lineStyle: {
            width: 1.6,
            color: stroke,
            shadowColor: `rgba(${rgb}, 0.45)`,
            shadowBlur: 4,
          },
          areaStyle: area
            ? {
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: `rgba(${rgb}, 0.45)` },
                    { offset: 0.6, color: `rgba(${rgb}, 0.10)` },
                    { offset: 1, color: `rgba(${rgb}, 0)` },
                  ],
                },
              }
            : undefined,
          // Pulsing end-dot — only the last data point carries the marker.
          markPoint: {
            symbol: "circle",
            symbolSize: 6,
            silent: true,
            label: { show: false },
            itemStyle: {
              color: stroke,
              borderColor: CHART_TOKENS.bgCanvas,
              borderWidth: 1.5,
              shadowColor: `rgba(${rgb}, 0.65)`,
              shadowBlur: 6,
            },
            data: [
              {
                coord: [lastIdx, lastVal],
              },
            ],
          },
          // Animated draw on first paint — the visible cue that these are
          // the new sparklines.
          animationDuration: 1200,
          animationEasing: "cubicOut",
        },
      ],
    };
  }, [safeValues, stroke, rgb, area, tooltipLabel]);

  if (option === null) {
    // Mirrors the inline-SVG behaviour: empty series renders an empty box
    // at the requested dimensions so row heights stay stable.
    return (
      <div
        className={className}
        style={{ width, height, display: "inline-block" }}
        aria-hidden
      />
    );
  }

  return (
    <div
      className={className}
      style={{ width, height, display: "inline-block" }}
    >
      <EChart option={option} width={width} height={height} />
    </div>
  );
}

export default EChartSparkline;
