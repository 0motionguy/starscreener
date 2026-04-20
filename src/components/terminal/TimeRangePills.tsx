"use client";

import { useFilterStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { TimeRange } from "@/lib/types";

interface PillDef {
  id: TimeRange;
  label: string;
  /** Tooltip shown on hover/focus to explain data-availability caveats. */
  tooltip: string;
}

// The 24h window relies on git-history deltas that need ~24 h of scrape
// cadence to resolve from "cold-start" (diagnostic) to "exact"/"nearest"
// (real). 7d and 30d are already resolved for most repos in the trending
// feed. The tooltip keeps that honest without hiding the pill.
const PILLS: PillDef[] = [
  {
    id: "24h",
    label: "24h",
    tooltip:
      "24h star deltas are warming up — coverage is partial while the scraper accumulates 24 h of history. 7d and 30d are more reliable right now.",
  },
  {
    id: "7d",
    label: "7d",
    tooltip: "Weekly star change — the most reliable window in the current data.",
  },
  {
    id: "30d",
    label: "30d",
    tooltip: "Monthly star change — broadest signal, smooths out short-term noise.",
  },
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
            title={pill.tooltip}
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
