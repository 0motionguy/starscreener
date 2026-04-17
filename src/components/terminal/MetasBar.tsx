"use client";

import { useFilterStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { MetaCounts, MetaFilter } from "@/lib/types";

interface MetasBarProps {
  counts: MetaCounts;
}

type MetaColor = "brand" | "amber" | "green" | "purple" | "cyan";

interface MetaDef {
  id: MetaFilter;
  icon: string;
  label: string;
  color: MetaColor;
  countKey: keyof MetaCounts;
}

const METAS: MetaDef[] = [
  {
    id: "hot",
    icon: "🔥",
    label: "Hot This Week",
    color: "brand",
    countKey: "hot",
  },
  {
    id: "breakouts",
    icon: "🚀",
    label: "Breakouts",
    color: "amber",
    countKey: "breakouts",
  },
  {
    id: "quiet-killers",
    icon: "💎",
    label: "Quiet Killers",
    color: "purple",
    countKey: "quietKillers",
  },
  {
    id: "new",
    icon: "🆕",
    label: "New <30d",
    color: "cyan",
    countKey: "new",
  },
  {
    id: "discussed",
    icon: "💬",
    label: "Most Discussed",
    color: "brand",
    countKey: "discussed",
  },
  {
    id: "rank-climbers",
    icon: "🏆",
    label: "Rank Climbers",
    color: "amber",
    countKey: "rankClimbers",
  },
  {
    id: "fresh-releases",
    icon: "⚡",
    label: "Fresh Releases",
    color: "green",
    countKey: "freshReleases",
  },
];

/**
 * MetasBar — horizontal row of 7 meta narrative filter pills.
 *
 * Each pill toggles `activeMetaFilter` in the filter store. Setting a meta
 * filter is a peer of `activeTab` (they clear each other — see store).
 *
 * Layout: wraps on desktop, scrolls horizontally with snap on mobile.
 * Disabled when the count for a meta is 0.
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
              "h-8 px-3 rounded-full",
              "text-xs font-medium",
              "border transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-functional/40",
              isActive
                ? "border-functional bg-functional-glow text-functional shadow-[inset_4px_0_0_var(--color-functional)]"
                : "border-border-primary/60 bg-bg-secondary text-text-secondary hover:border-brand/50 hover:bg-brand-subtle hover:text-text-primary",
              disabled && "opacity-40 pointer-events-none",
            )}
          >
            <span aria-hidden="true" className="text-[12px] leading-none">
              {meta.icon}
            </span>
            <span className="whitespace-nowrap">{meta.label}</span>
            <span
              className={cn(
                "font-mono text-[10px] px-1.5 py-0.5 rounded-full",
                "bg-bg-tertiary text-text-tertiary tabular-nums",
                isActive && "bg-functional/15 text-functional",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
