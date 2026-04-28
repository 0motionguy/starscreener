"use client";

import { useFilterStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { MetaCounts, MetaFilter } from "@/lib/types";

interface MetasBarProps {
  counts: MetaCounts;
}

interface MetaDef {
  id: MetaFilter;
  label: string;
  /** CSS color value driving the dot + active-state tint. */
  color: string;
  countKey: keyof MetaCounts;
}

const METAS: MetaDef[] = [
  {
    id: "hot",
    label: "HOT THIS WEEK",
    color: "var(--v3-acc)",
    countKey: "hot",
  },
  {
    id: "breakouts",
    label: "BREAKOUTS",
    color: "var(--v3-sig-amber)",
    countKey: "breakouts",
  },
  {
    id: "quiet-killers",
    label: "QUIET KILLERS",
    color: "#A78BFA",
    countKey: "quietKillers",
  },
  {
    id: "new",
    label: "NEW <30D",
    color: "var(--v3-sig-cyan)",
    countKey: "new",
  },
  {
    id: "discussed",
    label: "MOST DISCUSSED",
    color: "var(--v3-acc)",
    countKey: "discussed",
  },
  {
    id: "rank-climbers",
    label: "RANK CLIMBERS",
    color: "var(--v3-sig-amber)",
    countKey: "rankClimbers",
  },
  {
    id: "fresh-releases",
    label: "FRESH RELEASES",
    color: "var(--v3-sig-green)",
    countKey: "freshReleases",
  },
];

/**
 * V3 meta-narrative filter row.
 *
 * Each chip is a sharp-cornered mono tag with a color-coded square dot.
 * Active state floods the chip with the meta's color (border + tint + text);
 * inactive state is a hairline frame on the V3 panel surface. Counts ride
 * the right edge in a tabular-nums slot so column alignment stays stable.
 */
export function MetasBar({ counts }: MetasBarProps) {
  const active = useFilterStore((s) => s.activeMetaFilter);
  const setActive = useFilterStore((s) => s.setActiveMetaFilter);

  return (
    <div
      className={cn(
        "flex gap-2",
        "overflow-x-auto scrollbar-hide snap-x",
        "md:flex-wrap md:overflow-visible",
      )}
      role="group"
      aria-label="Meta filters"
    >
      {METAS.map((meta) => {
        const count = counts[meta.countKey];
        const isActive = active === meta.id;
        const disabled = count === 0;

        return (
          <button
            key={meta.id}
            type="button"
            onClick={() => setActive(isActive ? null : meta.id)}
            disabled={disabled}
            aria-pressed={isActive}
            className={cn(
              "group shrink-0 snap-start",
              "inline-flex items-center gap-2",
              "h-7 px-2.5 rounded-[2px]",
              "font-mono uppercase tracking-[0.16em]",
              "text-[10px] font-medium",
              "border transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-0",
              disabled && "opacity-40 pointer-events-none",
            )}
            style={{
              background: isActive
                ? `color-mix(in oklab, ${meta.color} 14%, transparent)`
                : "var(--v3-bg-050)",
              borderColor: isActive
                ? meta.color
                : "var(--v3-line-200)",
              color: isActive ? meta.color : "var(--v3-ink-200)",
            }}
          >
            <span
              aria-hidden="true"
              className="shrink-0 size-1.5"
              style={{
                background: meta.color,
                boxShadow: isActive
                  ? `0 0 6px color-mix(in oklab, ${meta.color} 60%, transparent)`
                  : undefined,
              }}
            />
            <span className="whitespace-nowrap">{meta.label}</span>
            <span
              className="font-mono text-[10px] tabular-nums tracking-[0.12em] px-1 rounded-[1px]"
              style={{
                color: isActive ? meta.color : "var(--v3-ink-400)",
                background: isActive
                  ? `color-mix(in oklab, ${meta.color} 18%, transparent)`
                  : "var(--v3-bg-100)",
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
