"use client";

// V4 — CapitalFlowChart (ECharts pilot migration)
//
// Stacked-area chart for funding § 02 "Capital flow · public comps".
// Same visual language as the Recharts pilot but rendered through Apache
// ECharts via the shared <EChart> wrapper:
//   * stacked area per sector (line series with `areaStyle`, `stack: 'total'`)
//   * top trend line = running total (separate line on the same y-axis)
//   * spike marker = `markLine` with a dashed vertical + label
//   * "today" end-cap dot drawn as the last series' endLabel/symbol
//
// External API is preserved 1:1 with the pure-SVG version:
//   <CapitalFlowChart
//     points={[
//       { day: 0, sectors: { agents: 1100, infra: 900, ... } },
//       ...
//     ]}
//     sectors={[{ key: "agents", label: "AGENTS", color: "var(--v4-violet)" }, ...]}
//     todayLabel="$4.3B"
//     spike={{ index: 22, label: "▲ ANTHROPIC $2.0B" }}
//   />
//
// Why a colour resolver: callers pass `color: "var(--v4-violet)"` etc. CSS
// custom properties don't survive the canvas rendering boundary, so we map
// known v4-token strings to literal hex (kept in sync with design/v4/tokens.css)
// and fall back to the brand SERIES_PALETTE by index for unknown values.

import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";

import { cn } from "@/lib/utils";
import { EChart } from "@/components/charts/EChart";
import { CHART_TOKENS, CHART_PALETTE } from "@/lib/charts/theme";

export interface CapitalFlowSector {
  key: string;
  label: string;
  color: string;
}

export interface CapitalFlowPoint {
  /** Day index 0..N-1 (0 = oldest, N-1 = today). */
  day: number;
  /** Per-sector $ value for this day. */
  sectors: Record<string, number>;
}

export interface CapitalFlowChartProps {
  points: CapitalFlowPoint[];
  sectors: CapitalFlowSector[];
  /** Optional spike marker (vertical line + label) at a point index. */
  spike?: { index: number; label: string };
  /** Label rendered next to the today end-point (e.g. "$4.3B"). */
  todayLabel?: string;
  /** Width / height (CSS lengths). Defaults match funding.html. */
  width?: number;
  height?: number;
  className?: string;
}

const DEFAULT_W = 880;
const DEFAULT_H = 280;

// v4 design tokens, mirrored from design/v4/tokens.css. CSS vars don't
// survive the canvas boundary so callers passing `var(--v4-violet)` get
// resolved to the literal hex here. Kept narrow on purpose — anything not
// in the table falls through to CHART_PALETTE by index.
const V4_TOKEN_HEX: Record<string, string> = {
  "--v4-acc": CHART_TOKENS.accent, // #ff6b35
  "--v4-money": CHART_TOKENS.positive, // #22c55e
  "--v4-red": CHART_TOKENS.negative, // #ff4d4d
  "--v4-amber": CHART_TOKENS.warning, // #ffb547
  "--v4-cyan": CHART_TOKENS.cyan, // #3ad6c5
  "--v4-violet": "#a78bfa",
  "--v4-blue": "#60a5fa",
  "--v4-pink": "#f472b6",
};

function resolveColor(input: string, fallbackIdx: number): string {
  // Match var(--name) — strip whitespace and ignore optional fallback args.
  const match = /^var\(\s*(--[a-z0-9-]+)/i.exec(input.trim());
  if (match) {
    const tokenHex = V4_TOKEN_HEX[match[1]];
    if (tokenHex) return tokenHex;
    return CHART_PALETTE[fallbackIdx % CHART_PALETTE.length];
  }
  // Already a literal colour (#hex / rgb() / hsl()) — pass through.
  return input;
}

export function CapitalFlowChart({
  points,
  sectors,
  spike,
  todayLabel,
  width = DEFAULT_W,
  height = DEFAULT_H,
  className,
}: CapitalFlowChartProps) {
  const N = points.length;

  const option = useMemo<EChartsCoreOption | null>(() => {
    if (N === 0 || sectors.length === 0) return null;

    // Day axis: ECharts renders categories as strings; "D-30 ... D-1, TODAY".
    // (Matches the original "D-{N - i}" labels every 5 days.)
    const xAxisData = points.map((_, i) => {
      const offset = N - 1 - i;
      return offset === 0 ? "TODAY" : `D-${offset}`;
    });

    // Per-day running total used by the top trend line + spike anchor.
    const totals = points.map((p) =>
      sectors.reduce((acc, s) => acc + (p.sectors[s.key] ?? 0), 0),
    );

    // One stacked area series per sector. ECharts stacks numerically when
    // every series in the stack uses the same `stack` group name.
    const areaSeries = sectors.map((s, idx) => {
      const color = resolveColor(s.color, idx);
      return {
        type: "line" as const,
        name: s.label,
        stack: "capital",
        smooth: false,
        showSymbol: false,
        sampling: "lttb" as const,
        data: points.map((p) => p.sectors[s.key] ?? 0),
        lineStyle: { width: 0.8, color, opacity: 0.5 },
        itemStyle: { color },
        areaStyle: { color, opacity: 0.6 },
        animationDuration: 0,
        z: 2,
      };
    });

    // Top trend line (running total) — non-stacked, white-ish hairline.
    // The "TODAY" endpoint dot lives on this series so it sits on top of
    // the cumulative total exactly like the original SVG.
    const trendSeries = {
      type: "line" as const,
      name: "Total",
      data: totals,
      smooth: false,
      showSymbol: false,
      lineStyle: { width: 1.4, color: "rgba(255, 255, 255, 0.55)" },
      itemStyle: { color: "#ffffff" },
      // Force a symbol on the very last point only (today end-cap).
      symbol: (_value: unknown, params: { dataIndex: number }) =>
        params.dataIndex === N - 1 ? "circle" : "none",
      symbolSize: 8,
      // The white dot needs a dark inner ring like the original SVG's
      // stroke="var(--v4-bg-000)" — done via the endLabel itemStyle below.
      endLabel: todayLabel
        ? {
            show: true,
            position: "top" as const,
            distance: 10,
            offset: [-8, 0] as [number, number],
            formatter: () => `TODAY · ${todayLabel}`,
            color: CHART_TOKENS.textDefault,
            fontFamily:
              'var(--font-mono, ui-monospace, SFMono-Regular, "Roboto Mono", monospace)',
            fontSize: 10,
            align: "right" as const,
          }
        : { show: false },
      // Spike marker as a markLine on the trend (one canvas line covers
      // the full y range, dashed, in accent orange — matches the original).
      markLine:
        spike && spike.index >= 0 && spike.index < N
          ? {
              symbol: ["none", "none"] as [string, string],
              animation: false,
              silent: true,
              lineStyle: {
                color: CHART_TOKENS.accent,
                type: "dashed" as const,
                width: 0.8,
                opacity: 0.6,
              },
              label: {
                show: true,
                position: "insideStartTop" as const,
                formatter: spike.label,
                color: CHART_TOKENS.accent,
                fontFamily:
                  'var(--font-mono, ui-monospace, SFMono-Regular, "Roboto Mono", monospace)',
                fontSize: 9,
                distance: [4, 4] as [number, number],
              },
              data: [{ xAxis: xAxisData[spike.index] }],
            }
          : undefined,
      animationDuration: 0,
      z: 5,
    };

    return {
      // Tighter than the theme default to fit the funding card's chrome.
      grid: { top: 14, right: 16, bottom: 28, left: 60, containLabel: false },
      xAxis: {
        type: "category" as const,
        data: xAxisData,
        boundaryGap: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: CHART_TOKENS.textFaint,
          fontSize: 9.5,
          fontFamily:
            'var(--font-mono, ui-monospace, SFMono-Regular, "Roboto Mono", monospace)',
          letterSpacing: "0.10em",
          // Match the original "every 5 days" cadence.
          interval: (idx: number) => idx % 5 === 0,
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value" as const,
        // 5 horizontal gridlines: 0%, 25%, 50%, 75%, 100% (theme handles dashes).
        splitNumber: 4,
        axisLabel: {
          color: CHART_TOKENS.textFaint,
          fontSize: 9.5,
          fontFamily:
            'var(--font-mono, ui-monospace, SFMono-Regular, "Roboto Mono", monospace)',
          // Original formatter: "$X.XB" with $0 special-case.
          formatter: (v: number) => {
            if (v === 0) return "$0";
            return `$${(v / 1000).toFixed(1)}B`;
          },
        },
        splitLine: {
          show: true,
          lineStyle: { color: "rgba(255,255,255,0.05)", type: "solid" as const },
        },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      // Tooltip kept minimal — original SVG had no tooltip, but ECharts'
      // default axis tooltip is genuinely useful here. Theme already styles it.
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "line" as const },
      },
      // No legend in the original — caller renders its own sector chips.
      legend: { show: false },
      animation: false,
      animationDuration: 0,
      series: [...areaSeries, trendSeries],
    };
  }, [points, sectors, spike, todayLabel, N]);

  return (
    <div
      className={cn("v4-capital-flow", className)}
      style={{ width: "100%", maxWidth: width, display: "block" }}
      role="img"
      aria-label={
        option === null
          ? "Capital flow chart — no data"
          : "Capital flow chart by sector"
      }
    >
      {option !== null ? (
        <EChart option={option} height={height} width="100%" />
      ) : (
        <div style={{ height, width: "100%" }} aria-hidden />
      )}
    </div>
  );
}
