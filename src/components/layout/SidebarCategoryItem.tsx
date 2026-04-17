"use client";

/**
 * SidebarCategoryItem — single category row inside the CATEGORIES section.
 *
 * Layout: [icon]  [name truncate]  [repoCount]  [heat dot]
 *
 * Active state: inset-left rail in the category's color + 5% tint of the
 * same color. Heat dot color + pulse animation derives from avgMomentum.
 * Click toggles `filterStore.category` — unselecting when already active.
 */
import { cn } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/category-icons";
import { useFilterStore } from "@/lib/store";

export interface SidebarCategoryItemProps {
  category: {
    id: string;
    name: string;
    shortName: string;
    icon: string;
    color: string;
  };
  repoCount: number;
  avgMomentum: number;
  active: boolean;
}

function heatColor(avgMomentum: number): string {
  if (avgMomentum >= 70) return "var(--color-heat-hot)";
  if (avgMomentum >= 55) return "var(--color-heat-warm)";
  if (avgMomentum >= 40) return "var(--color-heat-neutral)";
  return "var(--color-heat-cool)";
}

export function SidebarCategoryItem({
  category,
  repoCount,
  avgMomentum,
  active,
}: SidebarCategoryItemProps) {
  const setCategory = useFilterStore((s) => s.setCategory);
  const Icon = getCategoryIcon(category.icon);

  const dotColor = heatColor(avgMomentum);
  const isHot = avgMomentum >= 70;

  // When active: paint a 5% tint of the category's color as background + an
  // inset-left rail in the same color. `0D` = ~5% alpha in hex suffix form.
  const activeStyle = active
    ? {
        backgroundColor: `${category.color}0D`,
        boxShadow: `inset 2px 0 0 ${category.color}`,
      }
    : undefined;

  return (
    <button
      type="button"
      onClick={() => setCategory(active ? null : category.id)}
      aria-pressed={active}
      title={category.name}
      className={cn(
        "w-full h-9 flex items-center gap-2.5 pl-3 pr-2",
        "text-[13px] font-medium text-text-secondary",
        "transition-colors duration-150",
        !active && "hover:bg-bg-card-hover",
      )}
      style={activeStyle}
    >
      {Icon ? (
        <Icon
          className="shrink-0"
          style={{ color: category.color, width: 14, height: 14 }}
          strokeWidth={2}
        />
      ) : (
        <span
          className="shrink-0 rounded-sm"
          style={{ backgroundColor: category.color, width: 14, height: 14 }}
        />
      )}
      <span className="flex-1 truncate text-left">{category.shortName}</span>
      <span className="ml-auto flex items-center gap-1.5 shrink-0">
        <span className="font-mono text-[10px] text-text-tertiary tabular-nums">
          {repoCount}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            isHot && "animate-heat-pulse",
          )}
          style={{ backgroundColor: dotColor }}
        />
      </span>
    </button>
  );
}
