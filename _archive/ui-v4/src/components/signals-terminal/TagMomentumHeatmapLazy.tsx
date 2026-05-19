"use client";

// Lazy-loaded tag-momentum heatmap. Live height scales with row count
// (Math.max(180, rows.length * 22 + 40)); 280 px matches the typical 12-row
// dashboard layout and stays inside the same card body padding so the
// post-load reflow is minimal.

import dynamic from "next/dynamic";

export const TagMomentumHeatmapLazy = dynamic(
  () =>
    import("./TagMomentumHeatmap").then((m) => ({
      default: m.TagMomentumHeatmap,
    })),
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

export default TagMomentumHeatmapLazy;
