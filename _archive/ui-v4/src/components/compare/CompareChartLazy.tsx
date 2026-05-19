"use client";

import dynamic from "next/dynamic";

import type { CompareChartProps } from "./CompareChart";

const CompareChartIsland = dynamic(
  () =>
    import("./CompareChart").then((m) => ({
      default: m.CompareChart,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="skeleton-shimmer rounded-card h-[300px] w-full" />
    ),
  },
);

export function CompareChartLazy(
  props: CompareChartProps,
): React.ReactElement {
  return <CompareChartIsland {...props} />;
}

export default CompareChartLazy;
