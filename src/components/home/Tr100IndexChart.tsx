"use client";

// TR-100 Index area chart — 30-day rolling index of the top-N basket.
//
// History:
// 1. Original was an inline-SVG <path> with a `flatMap(spark.slice(-2))`
//    that jammed 30 repos' last-2-day deltas into a cliff-edge zigzag.
//    User complaint: "SHITTY CHARTS".
// 2. Rebuilt on Recharts AreaChart — declarative, accessible, but every
//    point is an SVG node and the dashboard ceiling kept getting closer.
// 3. NOW: ECharts via the shared <EChart> wrapper. Canvas-rendered, theme
//    pulled from src/lib/charts/theme.ts. ~95KB tree-shaken; the dashboard
//    can render thousands of points without touching the DOM.
//
// External API is unchanged: parent (server component) still passes
// `points: Tr100Point[]` and this client island handles the rest. No data
// transformation moved across the boundary.

import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { EChart } from "@/components/charts/EChart";
import { CHART_TOKENS } from "@/lib/charts/theme";

export interface Tr100Point {
  /** UTC ms timestamp at start of day. */
  ts: number;
  /** Aggregate cumulative stars across the basket for that day. */
  value: number;
}

interface Props {
  points: Tr100Point[];
}

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompact(value: number): string {
  return compactNumber.format(Math.max(0, Math.round(value))).toLowerCase();
}

function formatTick(ts: number): string {
  return new Date(ts)
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })
    .toUpperCase();
}

function formatTooltipDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface TooltipParam {
  value: [number, number];
}

export function Tr100IndexChart({ points }: Props) {
  const data = useMemo(
    () =>
      points
        .filter((p) => Number.isFinite(p.value) && p.value > 0)
        .map((p) => [p.ts, p.value] as [number, number]),
    [points],
  );

  const option = useMemo<EChartsCoreOption | null>(() => {
    if (data.length < 2) return null;

    const values = data.map(([, v]) => v);
    const min = Math.min(...values);
    const max = Math.max(...values);
    // Pad domain by ~3% so the line never kisses the chart edge.
    const span = Math.max(1, max - min);
    const yMin = Math.max(0, Math.floor(min - span * 0.03));
    const yMax = Math.ceil(max + span * 0.03);

    return {
      grid: { top: 14, right: 18, bottom: 24, left: 56, containLabel: false },
      xAxis: {
        type: "time",
        axisLabel: {
          formatter: (value: number) => formatTick(value),
          hideOverlap: true,
          margin: 10,
        },
      },
      yAxis: {
        type: "value",
        min: yMin,
        max: yMax,
        axisLabel: {
          formatter: (value: number) => formatCompact(value),
          margin: 8,
        },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        formatter: (params: TooltipParam[]) => {
          const point = params[0];
          if (!point) return "";
          const [ts, value] = point.value;
          const dateLabel = formatTooltipDate(ts);
          const valueLabel = formatCompact(value);
          return `
            <div style="text-transform: uppercase; color: ${CHART_TOKENS.textFaint}; margin-bottom: 4px; font-size: 10px; letter-spacing: 0.08em;">
              ${dateLabel}
            </div>
            <div style="display: flex; justify-content: space-between; gap: 14px;">
              <span style="text-transform: uppercase; color: ${CHART_TOKENS.textSubtle}; letter-spacing: 0.04em;">Index</span>
              <span style="font-variant-numeric: tabular-nums; color: ${CHART_TOKENS.textDefault};">${valueLabel}</span>
            </div>
          `;
        },
      },
      series: [
        {
          type: "line",
          data,
          showSymbol: false,
          // Active dot equivalent — only renders on hover.
          emphasis: {
            itemStyle: {
              color: CHART_TOKENS.accent,
              borderColor: CHART_TOKENS.bgCanvas,
              borderWidth: 2,
            },
            scale: 1.4,
          },
          lineStyle: { width: 2, color: CHART_TOKENS.accent },
          // Gradient area fill — top 40% opacity tapering to 0 at axis.
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(255, 107, 53, 0.40)" },
                { offset: 0.6, color: "rgba(255, 107, 53, 0.08)" },
                { offset: 1, color: "rgba(255, 107, 53, 0)" },
              ],
            },
          },
          animationDuration: 0,
        },
      ],
    };
  }, [data]);

  if (option === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 280,
          color: CHART_TOKENS.textFaint,
          fontFamily: "var(--font-mono), monospace",
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        Index warming up — collecting daily snapshots...
      </div>
    );
  }

  return (
    <EChart
      option={option}
      height={280}
      ariaLabel="TR-100 30-day index area chart"
    />
  );
}

export default Tr100IndexChart;
