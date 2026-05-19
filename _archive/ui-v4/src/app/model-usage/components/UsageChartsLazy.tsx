"use client";

// Lazy-loaded model-usage charts. UsageCharts.tsx exports four named chart
// components — CostStackedChart, LatencyLineChart, ReliabilityAreaChart,
// EventsAreaChart — all rendered at height={240}. Each one pulls in the
// shared <EChart> wrapper (Apache ECharts core + line/bar renderers + chart
// theme), which is heavy and not LCP-critical for the admin-only
// /model-usage page.
//
// We expose four lazy variants, one per chart. Each parent tab
// (CostTab / LatencyTab / ReliabilityTab / TrendsTab) only renders one
// chart at a time, so dynamic chunking lets the active tab pull in the
// charts code on demand instead of in first-load JS.
//
// Skeleton height (240 px) matches the live chart height in
// UsageCharts.tsx so swapping the placeholder for the real chart at
// hydration time does not introduce CLS.

import dynamic from "next/dynamic";

const SKELETON = () => (
  <div
    className="chart-skeleton"
    style={{ width: "100%", height: 240 }}
    aria-hidden
  />
);

export const CostStackedChartLazy = dynamic(
  () =>
    import("./UsageCharts").then((m) => ({ default: m.CostStackedChart })),
  { ssr: false, loading: SKELETON },
);

export const LatencyLineChartLazy = dynamic(
  () =>
    import("./UsageCharts").then((m) => ({ default: m.LatencyLineChart })),
  { ssr: false, loading: SKELETON },
);

export const ReliabilityAreaChartLazy = dynamic(
  () =>
    import("./UsageCharts").then((m) => ({ default: m.ReliabilityAreaChart })),
  { ssr: false, loading: SKELETON },
);

export const EventsAreaChartLazy = dynamic(
  () =>
    import("./UsageCharts").then((m) => ({ default: m.EventsAreaChart })),
  { ssr: false, loading: SKELETON },
);
