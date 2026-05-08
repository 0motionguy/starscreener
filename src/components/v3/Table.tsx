"use client";

// Table — accessible table wrapper with zebra stripes, sticky header,
// hover row highlight, and optional sortable column headers.
//
// Server-render-friendly: the wrapper is "use client" only because of the
// optional sort interactivity (clickable headers fire `onSortChange`). For
// fully static tables, callers can use a plain HTML <table> + the
// `tr-zebra` / `tr-table-sticky` utility classes from globals.css.
//
// Pattern reference for the zebra + sticky-header combo:
//   <table class="tr-zebra tr-table-sticky">…</table>
//
// Generic over the row type so cells can be type-safe without `any`.

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface TableColumn<R> {
  key: string;
  header: ReactNode;
  cell: (row: R, index: number) => ReactNode;
  sortable?: boolean;
  className?: string;
  /** Optional ARIA scope override; defaults to "col". */
  scope?: "col" | "row";
  /** Optional align — "right" snaps numeric columns. */
  align?: "left" | "right" | "center";
}

interface TableProps<R> {
  rows: R[];
  columns: TableColumn<R>[];
  rowKey: (row: R, index: number) => string;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
  onSortChange?: (key: string, direction: "asc" | "desc") => void;
  stickyHeader?: boolean;
  zebra?: boolean;
  /** Optional caption for screen readers (visually hidden). */
  caption?: string;
  /** Pass-through className applied to the outermost <table>. */
  className?: string;
  /** Empty-state node rendered inside <tbody> when rows is empty. */
  emptyState?: ReactNode;
}

export function Table<R>({
  rows,
  columns,
  rowKey,
  sortKey,
  sortDirection,
  onSortChange,
  stickyHeader = false,
  zebra = true,
  caption,
  className,
  emptyState,
}: TableProps<R>) {
  const handleSort = (col: TableColumn<R>) => {
    if (!col.sortable || !onSortChange) return;
    if (sortKey === col.key) {
      onSortChange(col.key, sortDirection === "asc" ? "desc" : "asc");
    } else {
      onSortChange(col.key, "desc");
    }
  };

  return (
    <table
      className={cn(
        "w-full border-collapse text-xs font-mono",
        zebra && "tr-zebra",
        stickyHeader && "tr-table-sticky",
        className,
      )}
    >
      {caption ? <caption className="sr-only">{caption}</caption> : null}
      <thead>
        <tr className="border-b border-border-subtle">
          {columns.map((col) => {
            const isSorted = col.sortable && sortKey === col.key;
            const ariaSort: "ascending" | "descending" | "none" | undefined =
              col.sortable
                ? isSorted
                  ? sortDirection === "asc"
                    ? "ascending"
                    : "descending"
                  : "none"
                : undefined;
            return (
              <th
                key={col.key}
                scope={col.scope ?? "col"}
                aria-sort={ariaSort}
                className={cn(
                  "px-3 py-2 font-medium uppercase tracking-wider text-text-subtle",
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center",
                  !col.align && "text-left",
                  col.className,
                )}
              >
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={() => handleSort(col)}
                    className={cn(
                      "inline-flex items-center gap-1 transition-colors",
                      "hover:text-text-default",
                      "focus:outline-none focus-visible:text-text-default",
                      isSorted && "text-text-default",
                    )}
                  >
                    <span>{col.header}</span>
                    {isSorted ? (
                      sortDirection === "asc" ? (
                        <ArrowUp className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <ArrowDown className="h-3 w-3" aria-hidden="true" />
                      )
                    ) : (
                      <ChevronsUpDown
                        className="h-3 w-3 opacity-50"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && emptyState ? (
          <tr>
            <td
              colSpan={columns.length}
              className="px-3 py-8 text-center text-text-subtle"
            >
              {emptyState}
            </td>
          </tr>
        ) : (
          rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className="border-b border-border-subtle/40"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-3 py-2 align-middle",
                    col.align === "right" && "text-right tabular-nums",
                    col.align === "center" && "text-center",
                    col.className,
                  )}
                >
                  {col.cell(row, index)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export default Table;
