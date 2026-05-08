"use client";

// Lazy-loaded capital-flow stacked-area chart for /funding § 02. The live
// component defaults to height=280 (DEFAULT_H in CapitalFlowChart.tsx); we
// match it on the skeleton. Callers that pass a custom `height` will see a
// brief 280-px placeholder before the real chart paints — acceptable
// because the funding card already reserves vertical space via card chrome
// and the chart is below the fold.

import dynamic from "next/dynamic";

export const CapitalFlowChartLazy = dynamic(
  () =>
    import("./CapitalFlowChart").then((m) => ({ default: m.CapitalFlowChart })),
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

export default CapitalFlowChartLazy;
