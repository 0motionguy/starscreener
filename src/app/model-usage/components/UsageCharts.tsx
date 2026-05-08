"use client";

// Client-side ECharts islands for the model-usage page.
//
// Migrated from Recharts to the shared Apache ECharts wrapper. Each chart
// stays a thin component so the parent server component decides which to
// render but the chart code stays client-only.

import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";

import "@/lib/charts/theme/full";
import { EChart } from "@/components/charts/EChart";
import { CHART_TOKENS } from "@/lib/charts/theme/tokens";

interface DayPoint {
  day: string;
  value: number;
  /** Optional second-series value (e.g. errors over events). */
  value2?: number;
}

const ACCENT = CHART_TOKENS.accent;
const POSITIVE = CHART_TOKENS.positive;
const WARNING = CHART_TOKENS.warning;
const NEGATIVE = CHART_TOKENS.negative;

const STACK_COLORS = [
  ACCENT,
  POSITIVE,
  WARNING,
  "#4a90e2", // bluesky
  "#ff4500", // reddit
  "#ff6600", // hackernews
];

// Shared axis + tooltip styling so the four charts feel like a set.
const baseAxisLabel = {
  color: CHART_TOKENS.textFaint,
  fontSize: 10,
};

const baseSplitLine = {
  lineStyle: { color: CHART_TOKENS.borderSubtle, type: "dashed" as const },
};

const baseTooltip = {
  backgroundColor: CHART_TOKENS.bgCanvas,
  borderColor: CHART_TOKENS.borderSubtle,
  borderWidth: 1,
  textStyle: {
    color: CHART_TOKENS.textDefault,
    fontSize: 12,
    fontFamily: "var(--font-mono, ui-monospace)",
  },
  extraCssText: "border-radius: 4px; box-shadow: none;",
};

// ---------------------------------------------------------------------------
// Cost — stacked bar by-model 30d (top 5 models + 'other').
// ---------------------------------------------------------------------------

interface CostStackedSeries {
  day: string;
  [modelId: string]: number | string;
}

interface CostStackedProps {
  data: CostStackedSeries[];
  models: string[];
}

export function CostStackedChart({ data, models }: CostStackedProps) {
  const option = useMemo<EChartsCoreOption>(() => {
    return {
      grid: { top: 8, right: 8, bottom: 24, left: 40, containLabel: false },
      xAxis: {
        type: "category" as const,
        data: data.map((d) => d.day),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...baseAxisLabel, hideOverlap: true },
      },
      yAxis: {
        type: "value" as const,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          ...baseAxisLabel,
          formatter: (v: number) => `$${v < 1 ? v.toFixed(2) : Math.round(v)}`,
        },
        splitLine: baseSplitLine,
      },
      tooltip: {
        ...baseTooltip,
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
      },
      series: models.map((m, i) => ({
        type: "bar" as const,
        name: m,
        stack: "cost",
        data: data.map((d) => Number(d[m] ?? 0)),
        itemStyle: { color: STACK_COLORS[i % STACK_COLORS.length] },
        animationDuration: 0,
      })),
    };
  }, [data, models]);

  return <EChart option={option} height={240} ariaLabel="Cost by model" />;
}

// ---------------------------------------------------------------------------
// Latency — p50 + p95 lines.
// ---------------------------------------------------------------------------

export function LatencyLineChart({ data }: { data: DayPoint[] }) {
  const option = useMemo<EChartsCoreOption>(() => {
    return {
      grid: { top: 8, right: 8, bottom: 24, left: 40, containLabel: false },
      xAxis: {
        type: "category" as const,
        data: data.map((d) => d.day),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...baseAxisLabel, hideOverlap: true },
        boundaryGap: false,
      },
      yAxis: {
        type: "value" as const,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          ...baseAxisLabel,
          formatter: (v: number) => `${(v / 1000).toFixed(1)}s`,
        },
        splitLine: baseSplitLine,
      },
      tooltip: {
        ...baseTooltip,
        trigger: "axis" as const,
      },
      series: [
        {
          type: "line" as const,
          name: "p50",
          showSymbol: false,
          data: data.map((d) => d.value),
          lineStyle: { width: 2, color: POSITIVE },
          itemStyle: { color: POSITIVE },
          animationDuration: 0,
        },
        {
          type: "line" as const,
          name: "p95",
          showSymbol: false,
          data: data.map((d) => d.value2 ?? null),
          lineStyle: { width: 2, color: WARNING },
          itemStyle: { color: WARNING },
          animationDuration: 0,
        },
      ],
    };
  }, [data]);

  return <EChart option={option} height={240} ariaLabel="Latency p50 and p95" />;
}

// ---------------------------------------------------------------------------
// Reliability — error rate area.
// ---------------------------------------------------------------------------

export function ReliabilityAreaChart({ data }: { data: DayPoint[] }) {
  const option = useMemo<EChartsCoreOption>(() => {
    return {
      grid: { top: 8, right: 8, bottom: 24, left: 40, containLabel: false },
      xAxis: {
        type: "category" as const,
        data: data.map((d) => d.day),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...baseAxisLabel, hideOverlap: true },
        boundaryGap: false,
      },
      yAxis: {
        type: "value" as const,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          ...baseAxisLabel,
          formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
        },
        splitLine: baseSplitLine,
      },
      tooltip: {
        ...baseTooltip,
        trigger: "axis" as const,
      },
      series: [
        {
          type: "line" as const,
          name: "error rate",
          showSymbol: false,
          data: data.map((d) => d.value),
          lineStyle: { width: 2, color: NEGATIVE },
          itemStyle: { color: NEGATIVE },
          areaStyle: { color: NEGATIVE, opacity: 0.2 },
          animationDuration: 0,
        },
      ],
    };
  }, [data]);

  return <EChart option={option} height={240} ariaLabel="Error rate" />;
}

// ---------------------------------------------------------------------------
// Events trend — area.
// ---------------------------------------------------------------------------

export function EventsAreaChart({ data }: { data: DayPoint[] }) {
  const option = useMemo<EChartsCoreOption>(() => {
    return {
      grid: { top: 8, right: 8, bottom: 24, left: 40, containLabel: false },
      xAxis: {
        type: "category" as const,
        data: data.map((d) => d.day),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...baseAxisLabel, hideOverlap: true },
        boundaryGap: false,
      },
      yAxis: {
        type: "value" as const,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: baseAxisLabel,
        splitLine: baseSplitLine,
      },
      tooltip: {
        ...baseTooltip,
        trigger: "axis" as const,
      },
      series: [
        {
          type: "line" as const,
          name: "events",
          showSymbol: false,
          data: data.map((d) => d.value),
          lineStyle: { width: 2, color: ACCENT },
          itemStyle: { color: ACCENT },
          areaStyle: { color: ACCENT, opacity: 0.25 },
          animationDuration: 0,
        },
      ],
    };
  }, [data]);

  return <EChart option={option} height={240} ariaLabel="Events trend" />;
}
