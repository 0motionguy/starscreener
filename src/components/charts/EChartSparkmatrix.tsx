"use client";

// Heatmap-stripe sparkline — same data as <EChartSparkline> but rendered
// as a 1×N row of coloured cells instead of a smooth line. Reads as a
// "matrix" / "tape" / "ticker" pattern; matches the Coin360 / consensus
// dashboard aesthetic where each cell is a discrete bucket.
//
// Used in <ConsensusRow> on the home page to give the // 02 "What
// multiple feeds agree on" section a more pattern-rich visual than the
// smooth line — every day is a cell, intensity = relative magnitude
// against the row's own min/max range, so a row that's been firing
// every day reads as a uniformly-bright stripe and a sporadic row reads
// as patchy dim/bright cells.

import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";

import { EChart } from "./EChart";
import { CHART_TOKENS } from "@/lib/charts/theme";

export interface EChartSparkmatrixProps {
  /** Numeric series — typically per-day star delta or per-day count. */
  values: number[];
  /** CSS class on the wrapping div. */
  className?: string;
  /** Default 100% (fills container). */
  width?: number | string;
  /** Default 22. */
  height?: number | string;
  /**
   * Base accent for the brightest cells. Defaults to brand accent.
   * Cooler cells fade to bgMuted at the bottom of the range.
   */
  color?: string;
  /** Tooltip prefix; default "value". */
  tooltipLabel?: string;
}

const DEFAULT_W = "100%";
const DEFAULT_H = 22;

function resolveColor(input: string | undefined): string {
  if (!input) return CHART_TOKENS.accent;
  if (input.startsWith("var(")) {
    if (input.includes("--sig-red")) return CHART_TOKENS.negative;
    if (input.includes("--sig-cyan")) return CHART_TOKENS.cyan;
    if (input.includes("--sig-green")) return CHART_TOKENS.positive;
    if (input.includes("--sig-yellow") || input.includes("--warning"))
      return CHART_TOKENS.warning;
    return CHART_TOKENS.accent;
  }
  return input;
}

export function EChartSparkmatrix({
  values,
  className,
  width = DEFAULT_W,
  height = DEFAULT_H,
  color,
  tooltipLabel = "value",
}: EChartSparkmatrixProps) {
  const safeValues = useMemo(
    () => values.filter((v) => Number.isFinite(v)),
    [values],
  );

  const accent = resolveColor(color);

  const option = useMemo<EChartsCoreOption | null>(() => {
    if (safeValues.length < 1) return null;

    const min = Math.min(...safeValues);
    const max = Math.max(...safeValues);
    const range = max - min || 1;

    // Heatmap data shape: [xIndex, yIndex (always 0), value].
    const data = safeValues.map((v, i) => [i, 0, v] as [number, number, number]);

    return {
      grid: { top: 1, right: 1, bottom: 1, left: 1, containLabel: false },
      xAxis: {
        type: "category",
        data: safeValues.map((_, i) => String(i)),
        show: false,
      },
      yAxis: {
        type: "category",
        data: [""],
        show: false,
      },
      visualMap: {
        show: false,
        min,
        max,
        inRange: {
          // Subtle dim bg → mid-tone border → fully-saturated accent for
          // the hottest day. Three-stop ramp gives a clear "cold vs hot"
          // read across the strip.
          color: [CHART_TOKENS.bgMuted, CHART_TOKENS.borderDefault, accent],
        },
      },
      tooltip: {
        trigger: "item",
        formatter: (params: { value: [number, number, number] }) => {
          const [, , v] = params.value;
          // Normalise to 0..1 so the tooltip shows where this cell sits in
          // the row's own range — useful when the absolute value is huge
          // (many thousands of stars) but the user just wants to know if
          // this day was hot or cold.
          const intensity = ((v - min) / range) * 100;
          return `<div style="font-family:var(--font-mono),monospace;font-size:11px;color:${CHART_TOKENS.textDefault};font-variant-numeric:tabular-nums;">
            <span style="color:${CHART_TOKENS.textSubtle};font-size:10px;text-transform:uppercase;letter-spacing:0.06em;">${tooltipLabel} </span>${v.toLocaleString()}
            <span style="color:${CHART_TOKENS.textFaint};font-size:10px;"> (${intensity.toFixed(0)}%)</span>
          </div>`;
        },
      },
      series: [
        {
          type: "heatmap",
          data,
          label: { show: false },
          itemStyle: {
            borderColor: CHART_TOKENS.bgCanvas,
            borderWidth: 0.5,
          },
          emphasis: {
            itemStyle: {
              borderColor: accent,
              borderWidth: 1,
            },
          },
          animationDuration: 600,
          animationEasing: "cubicOut",
        },
      ],
    };
  }, [safeValues, accent, tooltipLabel]);

  if (option === null) {
    return (
      <div
        className={className}
        style={{ width, height, display: typeof width === "string" ? "block" : "inline-block" }}
        aria-hidden
      />
    );
  }

  return (
    <div
      className={className}
      style={{ width, height, display: typeof width === "string" ? "block" : "inline-block" }}
    >
      <EChart option={option} width="100%" height="100%" />
    </div>
  );
}

export default EChartSparkmatrix;
