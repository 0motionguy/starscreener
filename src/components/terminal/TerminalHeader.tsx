"use client";

// StarScreener — Terminal sticky header row
//
// Renders a single `<tr>` of column headers inside `<thead>`. Sortable
// columns are `<button>` elements that cycle sort state
// null → desc → asc → null on each click. The active column shows a
// chevron and text-functional color.
//
// The rightmost header cell hosts the density toggle and the column
// picker gear. Density and visible columns live in `useFilterStore`.

import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Rows3,
  Settings2,
  StretchHorizontal,
} from "lucide-react";

import type { ColumnId, SortDirection } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useFilterStore } from "@/lib/store";

import type { Column } from "./columns";

interface TerminalHeaderProps {
  visibleColumns: Column[];
  sortColumn: ColumnId | null;
  sortDirection: SortDirection | null;
  onSort: (id: ColumnId) => void;
  onOpenColumnPicker: () => void;
}

function alignClass(a: Column["align"]): string {
  switch (a) {
    case "right":
      return "text-right justify-end";
    case "center":
      return "text-center justify-center";
    default:
      return "text-left justify-start";
  }
}

export function TerminalHeader({
  visibleColumns,
  sortColumn,
  sortDirection,
  onSort,
  onOpenColumnPicker,
}: TerminalHeaderProps) {
  const density = useFilterStore((s) => s.density);
  const setDensity = useFilterStore((s) => s.setDensity);

  return (
    <thead className="sticky top-0 z-20 bg-bg-primary/85 backdrop-blur-md">
      <tr className="border-b border-border-primary">
        {visibleColumns.map((col) => {
          const isActive = sortColumn === col.id && sortDirection !== null;
          const aria =
            isActive && sortDirection === "asc"
              ? "ascending"
              : isActive && sortDirection === "desc"
                ? "descending"
                : "none";

          const style =
            col.width > 0
              ? { width: col.width, minWidth: col.width }
              : { minWidth: 240 };

          const content = col.sortable ? (
            <button
              type="button"
              onClick={() => onSort(col.id)}
              title={col.description ?? col.label}
              className={cn(
                "label-micro inline-flex w-full items-center gap-1 px-2 py-2 hover:text-text-primary transition-colors",
                alignClass(col.align),
                isActive && "text-functional",
              )}
            >
              <span className="truncate">{col.label}</span>
              {isActive ? (
                sortDirection === "asc" ? (
                  <ChevronUp size={11} strokeWidth={2.5} className="shrink-0" />
                ) : (
                  <ChevronDown
                    size={11}
                    strokeWidth={2.5}
                    className="shrink-0"
                  />
                )
              ) : (
                <ArrowUpDown
                  size={10}
                  strokeWidth={2}
                  className="shrink-0 opacity-40"
                />
              )}
            </button>
          ) : (
            <span
              className={cn(
                "label-micro block px-2 py-2",
                alignClass(col.align),
              )}
              title={col.description ?? col.label}
            >
              {col.label}
            </span>
          );

          return (
            <th
              key={col.id}
              scope="col"
              aria-sort={aria}
              style={style}
              className={cn(
                "select-none bg-bg-primary",
                col.sticky === "left" && "sticky left-0 z-10",
              )}
            >
              {content}
            </th>
          );
        })}

        {/* Controls cell — density toggle + column picker gear */}
        <th
          scope="col"
          style={{ width: 80, minWidth: 80 }}
          className="bg-bg-primary"
        >
          <div className="flex items-center justify-end gap-1 px-2 py-1.5">
            <button
              type="button"
              onClick={() => setDensity("compact")}
              aria-label="Compact density"
              aria-pressed={density === "compact"}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded hover:bg-bg-tertiary transition-colors",
                density === "compact"
                  ? "text-functional"
                  : "text-text-tertiary",
              )}
            >
              <Rows3 size={13} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => setDensity("spacious")}
              aria-label="Spacious density"
              aria-pressed={density === "spacious"}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded hover:bg-bg-tertiary transition-colors",
                density === "spacious"
                  ? "text-functional"
                  : "text-text-tertiary",
              )}
            >
              <StretchHorizontal size={13} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={onOpenColumnPicker}
              aria-label="Configure columns"
              className="inline-flex size-6 items-center justify-center rounded text-text-tertiary hover:bg-bg-tertiary hover:text-text-primary transition-colors"
            >
              <Settings2 size={13} strokeWidth={2} />
            </button>
          </div>
        </th>
      </tr>
    </thead>
  );
}
