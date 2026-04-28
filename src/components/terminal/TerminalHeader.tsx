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
  disableSort?: boolean;
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
  disableSort = false,
}: TerminalHeaderProps) {
  const density = useFilterStore((s) => s.density);
  const setDensity = useFilterStore((s) => s.setDensity);

  // Inline V2 styling kept on the th itself so sticky positioning + the
  // hairline border survive the parent's `border-collapse: separate`
  // table model (Tailwind `border-b` doesn't render reliably on <th>
  // with that collapse mode).
  const headRowStyle = {
    background: "var(--v2-bg-050)",
  } as const;
  const thBaseStyle = {
    background: "var(--v2-bg-050)",
    borderBottom: "1px solid var(--v2-line-200)",
  } as const;

  return (
    <thead
      className="sticky top-0 z-20 backdrop-blur-md"
      style={{ background: "var(--v2-bg-050)" }}
    >
      <tr style={headRowStyle}>
        {visibleColumns.map((col) => {
          const isActive = sortColumn === col.id && sortDirection !== null;
          const aria =
            isActive && sortDirection === "asc"
              ? "ascending"
              : isActive && sortDirection === "desc"
                ? "descending"
                : "none";

          const style = {
            ...thBaseStyle,
            ...(col.width > 0
              ? { width: col.width, minWidth: col.width }
              : { minWidth: 240 }),
          };

          const sortGlyph = isActive ? (
            sortDirection === "asc" ? (
              <ChevronUp
                size={11}
                strokeWidth={2}
                className="shrink-0"
                style={{ color: "var(--v2-acc)" }}
              />
            ) : (
              <ChevronDown
                size={11}
                strokeWidth={2}
                className="shrink-0"
                style={{ color: "var(--v2-acc)" }}
              />
            )
          ) : col.sortable && !disableSort ? (
            <ArrowUpDown
              size={10}
              strokeWidth={1.5}
              className="shrink-0"
              style={{ color: "var(--v2-ink-400)" }}
            />
          ) : null;

          // V2 header cell: mono uppercase, 0.18em tracking (via .v2-mono),
          // 10px, ink-300 inactive / acc active. Active sort gets a soft
          // accent fill so the column reads as the focused axis.
          const labelStyle = {
            color: isActive ? "var(--v2-acc)" : "var(--v2-ink-300)",
            fontSize: 10,
            background: isActive ? "var(--v2-acc-soft)" : undefined,
            padding: "10px 12px",
          } as const;

          const content = col.sortable && !disableSort ? (
            <button
              type="button"
              onClick={() => onSort(col.id)}
              title={col.description ?? col.label}
              style={labelStyle}
              className={cn(
                "v2-mono inline-flex w-full items-center gap-1 transition-colors",
                alignClass(col.align),
              )}
            >
              <span className="truncate">{col.label}</span>
              {sortGlyph}
            </button>
          ) : (
            <span
              style={labelStyle}
              className={cn(
                "v2-mono inline-flex w-full items-center gap-1",
                alignClass(col.align),
              )}
              title={col.description ?? col.label}
            >
              <span className="truncate">{col.label}</span>
              {sortGlyph}
            </span>
          );

          return (
            <th
              key={col.id}
              scope="col"
              aria-sort={aria}
              style={style}
              className={cn(
                "select-none",
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
          style={{ width: 80, minWidth: 80, ...thBaseStyle }}
        >
          <div className="flex items-center justify-end gap-1 px-2 py-1.5">
            <button
              type="button"
              onClick={() => setDensity("compact")}
              aria-label="Compact density"
              aria-pressed={density === "compact"}
              className="inline-flex size-6 items-center justify-center transition-colors"
              style={{
                color:
                  density === "compact"
                    ? "var(--v2-acc)"
                    : "var(--v2-ink-400)",
                background:
                  density === "compact" ? "var(--v2-acc-soft)" : "transparent",
                borderRadius: 2,
              }}
            >
              <Rows3 size={13} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setDensity("spacious")}
              aria-label="Spacious density"
              aria-pressed={density === "spacious"}
              className="inline-flex size-6 items-center justify-center transition-colors"
              style={{
                color:
                  density === "spacious"
                    ? "var(--v2-acc)"
                    : "var(--v2-ink-400)",
                background:
                  density === "spacious" ? "var(--v2-acc-soft)" : "transparent",
                borderRadius: 2,
              }}
            >
              <StretchHorizontal size={13} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={onOpenColumnPicker}
              aria-label="Configure columns"
              className="inline-flex size-6 items-center justify-center transition-colors"
              style={{
                color: "var(--v2-ink-400)",
                borderRadius: 2,
              }}
            >
              <Settings2 size={13} strokeWidth={1.75} />
            </button>
          </div>
        </th>
      </tr>
    </thead>
  );
}
