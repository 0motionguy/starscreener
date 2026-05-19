"use client";

import dynamic from "next/dynamic";

import type { CompareHeatmapProps } from "./CompareHeatmap";

const CompareHeatmapIsland = dynamic(
  () =>
    import("./CompareHeatmap").then((m) => ({
      default: m.CompareHeatmap,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="v2-card p-4">
        <div className="grid grid-cols-[repeat(52,minmax(0,1fr))] gap-[2px]">
          {Array.from({ length: 52 * 7 }).map((_, i) => (
            <div
              key={i}
              className="skeleton-shimmer aspect-square rounded-[2px]"
            />
          ))}
        </div>
      </div>
    ),
  },
);

export function CompareHeatmapLazy(
  props: CompareHeatmapProps,
): React.ReactElement {
  return <CompareHeatmapIsland {...props} />;
}

export default CompareHeatmapLazy;
