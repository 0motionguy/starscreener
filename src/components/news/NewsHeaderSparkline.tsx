"use client";

// Client-only sparkline used inside the V3 news header snapshot card.
// Extracted from NewsTopHeaderV3.tsx so the parent stays a server
// component while the chart renders via the shared <EChart> wrapper.
//
// Visual contract preserved 1:1 with the previous hand-rolled <svg>:
//   - 200×38 box, line + soft area gradient under it
//   - last-point dot in v3-ink-000
//   - accent color drives both line stroke + gradient fill stops
//
// Note: ECharts canvas can't resolve `var(--v3-...)` inside gradient
// stops, so we resolve any incoming CSS-variable accent against the
// document at render time. Hex / rgba accents pass through unchanged.

import { useEffect, useMemo, useState } from "react";
import type { EChartsCoreOption } from "echarts/core";

import { EChart } from "@/components/charts/EChart";
import { CHART_TOKENS } from "@/lib/charts/theme";

interface NewsHeaderSparklineProps {
  values: number[];
  accent: string;
}

function resolveAccent(accent: string): string {
  // CSS variable strings (`var(--…)`) — the canvas can't resolve these
  // for gradient stops, so we read them from the documentElement style
  // when available, falling back to the brand accent token.
  if (!accent.startsWith("var(")) return accent;
  if (typeof window === "undefined") return CHART_TOKENS.accent;
  const m = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/.exec(accent);
  if (!m) return CHART_TOKENS.accent;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(m[1])
    .trim();
  return value || (m[2] ?? CHART_TOKENS.accent);
}

export function NewsHeaderSparkline({
  values,
  accent,
}: NewsHeaderSparklineProps) {
  // Resolve the accent on the client. SSR returns the safe fallback, then
  // the effect rehydrates with the actual computed CSS-variable value.
  const [resolvedAccent, setResolvedAccent] = useState<string>(() =>
    resolveAccent(accent),
  );
  useEffect(() => {
    setResolvedAccent(resolveAccent(accent));
  }, [accent]);

  const option = useMemo<EChartsCoreOption | null>(() => {
    if (values.length === 0) return null;

    // ECharts handles min/max axis fitting; the original padded by 2px top
    // and 4px bottom inside a 38px box, so we replicate that with grid
    // insets rather than custom y-axis math.
    const data = values.map((v, i) => [i, v] as [number, number]);
    const lastIdx = values.length - 1;
    const lastValue = values[lastIdx];

    return {
      animationDuration: 0,
      grid: {
        top: 2,
        right: 0,
        bottom: 2,
        left: 0,
        containLabel: false,
      },
      xAxis: {
        type: "value",
        min: 0,
        max: Math.max(1, values.length - 1),
        show: false,
      },
      yAxis: {
        type: "value",
        scale: true,
        show: false,
      },
      tooltip: { show: false },
      series: [
        {
          type: "line" as const,
          data,
          showSymbol: false,
          smooth: false,
          lineStyle: {
            color: resolvedAccent,
            width: 1.5,
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                {
                  offset: 0,
                  color: `color-mix(in srgb, ${resolvedAccent} 45%, transparent)`,
                },
                {
                  offset: 1,
                  color: `color-mix(in srgb, ${resolvedAccent} 0%, transparent)`,
                },
              ],
            },
          },
          z: 2,
          animationDuration: 0,
          // Last-point ink-000 dot — markPoint pinned to the trailing
          // sample so it stays anchored when the data updates.
          markPoint: {
            symbol: "circle",
            symbolSize: 4.8,
            data: [{ coord: [lastIdx, lastValue], name: "last" }],
            itemStyle: { color: CHART_TOKENS.textDefault },
            label: { show: false },
            animation: false,
          },
        },
      ],
    } satisfies EChartsCoreOption;
  }, [values, resolvedAccent]);

  if (!option) return null;

  return (
    <EChart
      option={option}
      height={38}
      width="100%"
      className="flex-1"
      ariaLabel="Sparkline"
    />
  );
}
