"use client";

import { useFilterStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { TimeRange } from "@/lib/types";

interface PillDef {
  id: TimeRange;
  label: string;
}

const PILLS: PillDef[] = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
];

/**
 * TimeRangePills — segmented pill group binding to useFilterStore.timeRange.
 *
 * Three compact mono pills in a single bordered container with hairline
 * dividers. Active pill = functional-glow bg + functional text.
 */
export function TimeRangePills() {
  const timeRange = useFilterStore((s) => s.timeRange);
  const setTimeRange = useFilterStore((s) => s.setTimeRange);

  return (
    <div
      role="group"
      aria-label="Time range"
      className={cn(
        "flex items-center",
        "border border-border-primary rounded-md",
        "divide-x divide-border-primary overflow-hidden",
      )}
    >
      {PILLS.map((pill) => {
        const isActive = timeRange === pill.id;
        return (
          <button
            key={pill.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => setTimeRange(pill.id)}
            className={cn(
              "px-2.5 py-1 text-[11px] font-mono",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-functional/40 focus-visible:z-10",
              isActive
                ? "bg-functional-glow text-functional"
                : "text-text-tertiary hover:text-text-primary hover:bg-bg-secondary",
            )}
          >
            {pill.label}
          </button>
        );
      })}
    </div>
  );
}
