"use client";

// StarScreener — Terminal loading skeleton
//
// Renders a header strip + N skeleton rows whose cell widths match the
// real column definitions. Used while `useFilterStore` hydrates or while
// a data fetch is in flight.

import { useMemo } from "react";

import type { Density } from "@/lib/types";
import { useFilterStore } from "@/lib/store";
import { cn } from "@/lib/utils";

import { COLUMNS_BY_ID } from "./columns";

interface TerminalSkeletonProps {
  rows?: number;
  density?: Density;
}

export function TerminalSkeleton({
  rows = 12,
  density,
}: TerminalSkeletonProps) {
  const storedDensity = useFilterStore((s) => s.density);
  const visibleColumns = useFilterStore((s) => s.visibleColumns);

  const effectiveDensity = density ?? storedDensity;
  const rowHeight = effectiveDensity === "compact" ? 44 : 56;

  const cols = useMemo(
    () =>
      visibleColumns
        .map((id) => COLUMNS_BY_ID[id])
        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [visibleColumns],
  );

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="w-full overflow-hidden rounded-card border border-border-primary"
    >
      {/* Header */}
      <div className="flex items-center gap-0 border-b border-border-primary bg-bg-primary px-0 py-2">
        {cols.map((col) => (
          <div
            key={col.id}
            style={
              col.width > 0
                ? { width: col.width, minWidth: col.width }
                : { minWidth: 240, flex: 1 }
            }
            className="px-2"
          >
            <div className="h-3 w-12 skeleton-shimmer rounded" />
          </div>
        ))}
        <div style={{ width: 80 }} />
      </div>

      {/* Rows */}
      <div role="presentation">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            style={{ height: rowHeight }}
            className={cn(
              "flex items-center gap-0 border-b border-border-secondary bg-bg-primary",
            )}
          >
            {cols.map((col) => (
              <div
                key={col.id}
                style={
                  col.width > 0
                    ? { width: col.width, minWidth: col.width }
                    : { minWidth: 240, flex: 1 }
                }
                className={cn(
                  "px-2",
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center",
                )}
              >
                <div
                  className={cn(
                    "h-3 skeleton-shimmer rounded",
                    col.id === "repo" ? "w-40" : "w-10",
                    col.align === "right" && "ml-auto",
                    col.align === "center" && "mx-auto",
                  )}
                />
              </div>
            ))}
            <div style={{ width: 80 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
