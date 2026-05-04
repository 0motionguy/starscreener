// Shared dense table for news / feed surfaces (/lobsters, /hackernews,
// /devto, /bluesky, /npm). One semantic <table> with v3 chrome, mono
// uppercase headers, hairline dashed dividers, hover lift via .v2-row,
// and stagger entry capped at 6 rows × 50ms (matches FeaturedCard).
//
// Reduced motion: CSS @media gate in globals.css (line 1103) zeroes out
// animation-duration, so no JS hook needed. Server-component-friendly.

import type { ReactNode } from "react";

export interface FeedColumn<T> {
  /** Stable key for React. */
  id: string;
  /** Header label. Rendered v2-mono uppercase. */
  header: string;
  /** Optional fixed width (px or %). */
  width?: string;
  /** "left" | "right" — defaults to "left". Use "right" for tabular numerics. */
  align?: "left" | "right";
  /** Hide BELOW this breakpoint (i.e. visible from this size up). */
  hideBelow?: "sm" | "md" | "lg";
  /** Hide ABOVE this breakpoint (i.e. only visible BELOW this size). */
  hideAbove?: "sm" | "md" | "lg";
  /** Render the cell body. */
  render: (row: T, rowIndex: number) => ReactNode;
}

interface TerminalFeedTableProps<T> {
  rows: T[];
  columns: FeedColumn<T>[];
  /** Stable key per row. */
  rowKey: (row: T, rowIndex: number) => string;
  /** Page accent — used for the table chrome eyebrow + active state. */
  accent: string;
  /** Optional aria caption for screen readers. */
  caption?: string;
  /** Empty-state copy. */
  emptyTitle?: string;
  emptySubtitle?: string;
  /**
   * Force `table-layout: fixed`. Default off (auto layout) keeps the
   * /lobsters etc. story-title cells flexible. Set true on pages where one
   * cell can hold huge unbreakable strings (npm registry descriptions) and
   * blow the column past the viewport — pair with explicit `width` on every
   * column for predictable distribution.
   */
  fixedLayout?: boolean;
}

const HIDE_BELOW_CLASS: Record<NonNullable<FeedColumn<unknown>["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

const HIDE_ABOVE_CLASS: Record<NonNullable<FeedColumn<unknown>["hideAbove"]>, string> = {
  sm: "table-cell sm:hidden",
  md: "table-cell md:hidden",
  lg: "table-cell lg:hidden",
};

function visibilityClass(col: { hideBelow?: FeedColumn<unknown>["hideBelow"]; hideAbove?: FeedColumn<unknown>["hideAbove"] }): string {
  if (col.hideBelow) return HIDE_BELOW_CLASS[col.hideBelow];
  if (col.hideAbove) return HIDE_ABOVE_CLASS[col.hideAbove];
  return "";
}

export function TerminalFeedTable<T>({
  rows,
  columns,
  rowKey,
  accent,
  caption,
  emptyTitle = "No items in this window.",
  emptySubtitle,
  fixedLayout = false,
}: TerminalFeedTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-[2px] border border-dashed px-4 py-10 text-center"
        style={{
          borderColor: "var(--v4-line-100)",
          background: "var(--v4-bg-025)",
        }}
      >
        <p
          className="v2-mono text-[11px] tracking-[0.18em] uppercase"
          style={{ color: "var(--v4-ink-300)" }}
        >
          {emptyTitle}
        </p>
        {emptySubtitle ? (
          <p
            className="mt-1 text-[11px]"
            style={{ color: "var(--v4-ink-400)" }}
          >
            {emptySubtitle}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto"
      style={{
        background: "var(--v4-bg-050)",
        border: "1px solid var(--v4-line-200)",
        borderRadius: 2,
      }}
    >
      <table
        className="w-full text-[12px]"
        style={{
          borderCollapse: "collapse",
          tableLayout: fixedLayout ? "fixed" : "auto",
        }}
      >
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--v4-line-100)",
              background: "var(--v4-bg-025)",
            }}
          >
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                className={`v2-mono px-3 py-2 text-[10px] tracking-[0.18em] uppercase ${
                  col.align === "right" ? "text-right" : "text-left"
                } ${visibilityClass(col)}`}
                style={{
                  width: col.width,
                  color: "var(--v4-ink-400)",
                  fontWeight: 500,
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const stagger = Math.min(rowIndex, 6) * 50;
            return (
              <tr
                key={rowKey(row, rowIndex)}
                className="v2-row group"
                style={{
                  borderBottom: "1px dashed var(--v4-line-100)",
                  animation: "slide-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
                  animationDelay: stagger > 0 ? `${stagger}ms` : undefined,
                  ["--feed-accent" as string]: accent,
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={`px-3 py-2.5 align-middle ${
                      col.align === "right" ? "text-right tabular-nums" : "text-left"
                    } ${visibilityClass(col)}`}
                    style={{
                      width: col.width,
                      color: "var(--v4-ink-100)",
                    }}
                  >
                    {col.render(row, rowIndex)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default TerminalFeedTable;
