"use client";

// Lazy-loaded stacked-area volume chart. Skeleton sized to match the live
// chart canvas height (220 px) declared in VolumeAreaChart.tsx so the
// per-source rail and ChartStats below never shift down on hydration.

import dynamic from "next/dynamic";

export const VolumeAreaChartLazy = dynamic(
  () =>
    import("./VolumeAreaChart").then((m) => ({ default: m.VolumeAreaChart })),
  {
    ssr: false,
    loading: () => (
      <div
        className="chart-skeleton"
        style={{ width: "100%", height: 220 }}
        aria-hidden
      />
    ),
  },
);

export default VolumeAreaChartLazy;
