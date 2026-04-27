"use client";

/**
 * SidebarCategoryItem — single category row inside the CATEGORIES section.
 *
 * V2 layout: [icon] [name MONO uppercase 11px] [count chip] [heat dot]
 *
 * Active state: V2 bracket frame on the row + 3px accent left rail in the
 * category's color, plus a low-alpha tint of the same color so the active
 * row reads as a discrete cell. Heat dot color + pulse animation derives
 * from avgMomentum. Click toggles `filterStore.category` — unselecting
 * when already active.
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

  // Active row: 8% tint of the category color + 3px inset-left rail in
  // the same color + a 1px V2 line border so the row reads as a
  // discrete cell against the rail background. `14` ≈ 8% alpha hex.
  const style: React.CSSProperties = active
    ? {
        backgroundColor: `${category.color}14`,
        boxShadow: `inset 3px 0 0 ${category.color}`,
        border: "1px solid var(--v2-line-200)",
        borderRadius: 1,
        color: "var(--v2-ink-100)",
      }
    : {
        border: "1px solid transparent",
        borderRadius: 1,
        color: "var(--v2-ink-300)",
      };

  return (
    <button
      type="button"
      onClick={() => setCategory(active ? null : category.id)}
      aria-pressed={active}
      title={category.name}
      className={cn(
        "v2-mono relative w-full h-8 flex items-center gap-2 pl-3 pr-2",
        "text-[11px] tracking-[0.16em] transition-colors duration-150",
        active && "v2-bracket",
        !active && "hover:bg-[var(--v2-bg-100)] hover:text-[var(--v2-ink-100)]",
      )}
      style={style}
    >
      {Icon ? (
        <Icon
          className="shrink-0"
          style={{ color: category.color, width: 14, height: 14 }}
          strokeWidth={2}
        />
      ) : (
        <span
          className="shrink-0"
          style={{
            backgroundColor: category.color,
            width: 14,
            height: 14,
            borderRadius: 1,
          }}
        />
      )}
      <span className="flex-1 truncate text-left">{category.shortName}</span>
      <span className="ml-auto flex items-center gap-1.5 shrink-0">
        <span
          className="v2-mono tabular-nums inline-flex items-center justify-center"
          style={{
            background: active ? "var(--v2-acc-soft)" : "var(--v2-bg-200)",
            color: active ? "var(--v2-acc)" : "var(--v2-ink-300)",
            height: 16,
            minWidth: 20,
            padding: "0 5px",
            fontSize: 9,
            borderRadius: 1,
          }}
        >
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
