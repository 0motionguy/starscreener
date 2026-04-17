"use client";

import { CATEGORIES } from "@/lib/constants";

interface CategoryPillProps {
  categoryId: string;
  size?: "sm" | "md";
  variant?: "default" | "brand";
  className?: string;
}

/**
 * Colored category label pill.
 *
 * - `variant="default"` (the default): renders a category-color dot + name
 *   with a neutral bordered pill shape.
 * - `variant="brand"`: orange/brand-tinted pill used on featured cards where
 *   the category color would clash with the surrounding brand treatment.
 *   Same size + typography, just different palette.
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
      ? "px-2 py-0.5 text-[10px]"
      : "px-2.5 py-0.5 text-xs";

  if (variant === "brand") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-badge bg-brand-subtle text-brand border border-brand/30 uppercase tracking-wider font-medium ${sizeClasses} ${className}`}
      >
        <span
          className="shrink-0 size-1.5 rounded-full bg-brand"
          aria-hidden="true"
        />
        {category.shortName}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-badge border border-border-primary text-text-secondary uppercase tracking-wider font-medium ${sizeClasses} ${className}`}
    >
      <span
        className="shrink-0 size-1.5 rounded-full"
        style={{ backgroundColor: category.color }}
        aria-hidden="true"
      />
      {category.shortName}
    </span>
  );
}
