// ECharts theme + module registration for TrendingRepo.
//
// We register ONLY the chart types and components we use, via echarts/core.
// This keeps the gzipped bundle ~95KB instead of ~600KB (full echarts).
// Add new chart types here when a session needs them; do NOT switch any
// component to `import * as echarts from "echarts"` — that defeats the
// tree-shake.
//
// The `trendingrepo-dark` theme is registered once at module load. Every
// <EChart> mounts with `theme="trendingrepo-dark"` so brand colors come
// for free; per-chart option objects can still override.

import * as echarts from "echarts/core";
// Note: there is no separate AreaChart in ECharts — an "area" is a LineChart
// series with `areaStyle` set. The Line/Bar/Scatter trio covers every chart
// type used on the dashboard today.
import { BarChart, HeatmapChart, LineChart, ScatterChart, TreemapChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  // Charts
  LineChart,
  BarChart,
  ScatterChart,
  HeatmapChart,
  TreemapChart,
  // Components
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  DataZoomComponent,
  VisualMapComponent,
  MarkLineComponent,
  // Renderer — Canvas for perf; ECharts also ships SVG if needed
  CanvasRenderer,
]);

// Brand tokens, mirrored from src/app/globals.css. Kept in sync manually —
// CSS custom properties don't survive the canvas rendering boundary, so the
// theme has to use literal hex.
const TOKENS = {
  bgCanvas: "#08090a",
  bgRaised: "#101418",
  bgMuted: "#151a20",
  borderSubtle: "#1a2026",
  borderDefault: "#222a32",
  textDefault: "#eef0f2",
  textSubtle: "#84909b",
  textFaint: "#909caa",
  textDisabled: "#3c444d",
  accent: "#ff6b35", // Liquid Lava orange — momentum
  positive: "#22c55e", // green — breakouts / accelerating
  negative: "#ff4d4d",
  warning: "#ffb547",
  cyan: "#3ad6c5",
} as const;

// Brand series palette: ordered so the first 5 series read as
// momentum-orange → positive-green → cyan → warning-amber → red,
// which matches the legend semantics on the dashboard.
const SERIES_PALETTE = [
  TOKENS.accent,
  TOKENS.positive,
  TOKENS.cyan,
  TOKENS.warning,
  TOKENS.negative,
  "#a78bfa", // violet for the 6th
  "#f472b6", // pink for the 7th
];

const FONT_MONO =
  'var(--font-mono, ui-monospace, SFMono-Regular, "Roboto Mono", monospace)';

const trendingrepoDark = {
  color: SERIES_PALETTE,
  backgroundColor: "transparent",
  textStyle: {
    fontFamily: FONT_MONO,
    color: TOKENS.textDefault,
  },
  title: {
    textStyle: {
      color: TOKENS.textDefault,
      fontWeight: 500,
      fontSize: 13,
      letterSpacing: "0.06em",
    },
    subtextStyle: {
      color: TOKENS.textSubtle,
      fontSize: 11,
    },
  },
  grid: {
    top: 16,
    right: 18,
    bottom: 28,
    left: 48,
    containLabel: false,
    borderColor: TOKENS.borderSubtle,
  },
  categoryAxis: {
    axisLine: { show: false, lineStyle: { color: TOKENS.borderDefault } },
    axisTick: { show: false },
    axisLabel: {
      color: TOKENS.textFaint,
      fontSize: 10,
      fontFamily: FONT_MONO,
    },
    splitLine: {
      show: false,
      lineStyle: { color: TOKENS.borderSubtle, type: "dashed" },
    },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: TOKENS.textFaint,
      fontSize: 10,
      fontFamily: FONT_MONO,
    },
    splitLine: {
      show: true,
      lineStyle: { color: TOKENS.borderSubtle, type: "dashed", opacity: 0.6 },
    },
  },
  timeAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: TOKENS.textFaint,
      fontSize: 10,
      fontFamily: FONT_MONO,
    },
    splitLine: { show: false },
  },
  legend: {
    textStyle: { color: TOKENS.textSubtle, fontSize: 11 },
    inactiveColor: TOKENS.textDisabled,
    icon: "roundRect",
  },
  tooltip: {
    backgroundColor: TOKENS.bgCanvas,
    borderColor: TOKENS.borderDefault,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: {
      color: TOKENS.textDefault,
      fontSize: 11,
      fontFamily: FONT_MONO,
    },
    extraCssText: "letter-spacing: 0.04em; box-shadow: none;",
    axisPointer: {
      type: "line",
      lineStyle: { color: TOKENS.borderDefault, type: "dashed", width: 1 },
    },
  },
  dataZoom: {
    backgroundColor: "transparent",
    fillerColor: "rgba(255, 107, 53, 0.10)",
    handleColor: TOKENS.accent,
    dataBackground: {
      lineStyle: { color: TOKENS.borderDefault },
      areaStyle: { color: "rgba(255, 107, 53, 0.06)" },
    },
    textStyle: { color: TOKENS.textFaint, fontSize: 10 },
  },
  line: {
    smooth: false,
    symbol: "none",
    lineStyle: { width: 2 },
  },
  scatter: {
    symbolSize: 6,
    itemStyle: { opacity: 0.85 },
  },
  bar: {
    itemStyle: { borderRadius: [2, 2, 0, 0] },
  },
};

echarts.registerTheme("trendingrepo-dark", trendingrepoDark);

export const TR_DARK_THEME = "trendingrepo-dark" as const;
export const CHART_TOKENS = TOKENS;
export const CHART_PALETTE = SERIES_PALETTE;
export { echarts };
