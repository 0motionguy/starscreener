"use client";

// Lazy-loaded TR-100 Index chart. The original Tr100IndexChart pulls in the
// shared <EChart> wrapper (Apache ECharts core + line/area renderers + chart
// theme tokens) — that bundle is ~95 kB tree-shaken and not LCP-critical on
// the homepage, so we defer it behind next/dynamic.
//
// Skeleton height (280 px) MUST match the chart's rendered height in
// Tr100IndexChart.tsx so swapping the placeholder for the live chart at
// hydration time does not introduce CLS (cumulative layout shift).

import dynamic from "next/dynamic";

export const Tr100IndexChartLazy = dynamic(
  () => import("./Tr100IndexChart").then((m) => ({ default: m.Tr100IndexChart })),
  {
    ssr: false,
    loading: () => (
      <div
        className="chart-skeleton"
        style={{ width: "100%", height: 280 }}
        aria-hidden
      />
    ),
  },
);

export default Tr100IndexChartLazy;
