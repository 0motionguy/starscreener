"use client";

// Client-side sparkline for the per-MCP detail page.
//
// Migrated from Recharts AreaChart to the shared Apache ECharts wrapper for
// bundle parity with the rest of the dashboard. The visual contract is
// preserved: cyan gradient area, no animations, mono tooltip.
//
// IMPORTANT: render only when the parent has real history points to pass.
// The parent is responsible for the placeholder when `points` is null —
// this component does NOT synthesize fake data.

import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";

import { EChart } from "@/components/charts/EChart";
import { CHART_TOKENS } from "@/lib/charts/theme";
import type { McpDownloadsHistoryPoint } from "@/lib/mcp-detail";

interface McpDownloadsSparklineProps {
  points: McpDownloadsHistoryPoint[];
}

const ACCENT_RGB = "58, 214, 197"; // cyan, mirrors the prior gradient stops

export function McpDownloadsSparkline({ points }: McpDownloadsSparklineProps) {
  const option = useMemo<EChartsCoreOption>(() => {
    const data = points.map((p) => [p.date, p.total] as [string, number]);
    return {
      grid: { top: 8, right: 8, bottom: 24, left: 36, containLabel: false },
      xAxis: {
        type: "category" as const,
        data: points.map((p) => p.date),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: CHART_TOKENS.textFaint,
          fontSize: 10,
          hideOverlap: true,
          margin: 8,
        },
        boundaryGap: false,
      },
      yAxis: {
        type: "value" as const,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: CHART_TOKENS.textFaint,
          fontSize: 10,
          margin: 4,
        },
        splitLine: {
          lineStyle: { color: CHART_TOKENS.borderSubtle, type: "dashed" },
        },
      },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: CHART_TOKENS.bgRaised,
        borderColor: CHART_TOKENS.borderDefault,
        textStyle: {
          color: CHART_TOKENS.textDefault,
          fontSize: 11,
          fontFamily: "var(--font-mono, ui-monospace)",
        },
        extraCssText: "letter-spacing: 0.04em; box-shadow: none;",
        formatter: (params: unknown) => {
          const list = Array.isArray(params)
            ? (params as Array<{ axisValue: string; data: [string, number] }>)
            : [params as { axisValue: string; data: [string, number] }];
          const first = list[0];
          if (!first) return "";
          const total = Array.isArray(first.data)
            ? first.data[1]
            : (first.data as unknown as number);
          return `<div style="color:${CHART_TOKENS.textSubtle};">${first.axisValue}</div><div style="color:#3ad6c5;font-variant-numeric:tabular-nums;">${total.toLocaleString("en-US")}</div>`;
        },
      },
      series: [
        {
          type: "line" as const,
          name: "downloads",
          showSymbol: false,
          data,
          lineStyle: { width: 1.5, color: `rgba(${ACCENT_RGB}, 0.85)` },
          areaStyle: {
            color: {
              type: "linear" as const,
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `rgba(${ACCENT_RGB}, 0.55)` },
                { offset: 1, color: `rgba(${ACCENT_RGB}, 0.04)` },
              ],
            },
          },
          animationDuration: 0,
        },
      ],
    };
  }, [points]);

  return (
    <div className="h-[160px] w-full">
      <EChart option={option} height="100%" ariaLabel="MCP downloads sparkline" />
    </div>
  );
}

export default McpDownloadsSparkline;
