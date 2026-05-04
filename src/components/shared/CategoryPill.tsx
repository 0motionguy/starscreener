"use client";

import { Badge } from "@/components/ui/Badge";
import { CATEGORIES } from "@/lib/constants";

interface CategoryPillProps {
  categoryId: string;
  size?: "sm" | "md";
  variant?: "default" | "brand";
  className?: string;
}

/**
 * V3 category tag.
 *
 * - `variant="default"`: hairline frame with the category color dot in the
 *   left rail. Carries the dataset color without flooding the row.
 * - `variant="brand"`: accent-tinted frame, used when the surrounding
 *   surface already commits to the brand accent and a neutral dot would
 *   feel disconnected.
 *
 * Both variants share the same 2px-corner mono-uppercase contract.
 */
export function CategoryPill({
  categoryId,
  size = "sm",
  variant = "default",
  className = "",
}: CategoryPillProps) {
  const category = CATEGORIES.find((c) => c.id === categoryId);

  if (!category) return null;

  const sizeClasses =
    size === "sm"
      ? "h-[18px] px-1.5 text-[10px]"
      : "h-[22px] px-2 text-[11px]";

  const baseClasses = `inline-flex items-center gap-1.5 rounded-[2px] font-mono uppercase tracking-[0.16em] font-medium tabular-nums ${sizeClasses}`;

  if (variant === "brand") {
    return (
      <Badge
        size={size === "sm" ? "xs" : "sm"}
        dot
        className={`${baseClasses} ${className}`}
        style={{
          background: "var(--v4-acc-soft)",
          border: "1px solid var(--v4-acc-dim)",
          color: "var(--v4-acc)",
        }}
        dotStyle={{
          background: "var(--v4-acc)",
          boxShadow: "0 0 4px var(--v4-acc-glow)",
        }}
      >
        {category.shortName}
      </Badge>
    );
  }

  return (
    <Badge
      size={size === "sm" ? "xs" : "sm"}
      dot
      className={`${baseClasses} ${className}`}
      style={{
        background: "var(--v4-bg-050)",
        border: "1px solid var(--v4-line-200)",
        color: "var(--v4-ink-200)",
      }}
      dotStyle={{ backgroundColor: category.color }}
    >
      {category.shortName}
    </Badge>
  );
}
