"use client";

// StarScreener — Terminal body cell
//
// Thin wrapper around the `<td>` that applies column-driven width /
// alignment / overflow rules and delegates actual content rendering to
// `column.render(repo, rowContext)`. Keeping the polymorphism here lets
// TerminalRow stay a dumb iterator.

import type { Repo } from "@/lib/types";
import { cn } from "@/lib/utils";

import type { Column, RowContext } from "./columns";

interface TerminalCellProps {
  column: Column;
  repo: Repo;
  rowContext: RowContext;
}

const NUMERIC_IDS = new Set([
  "rank",
  "stars",
  "delta24h",
  "delta7d",
  "delta30d",
  "forks",
  "contrib",
  "issues",
  "buzz",
]);

function alignClass(a: Column["align"]): string {
  switch (a) {
    case "right":
      return "text-right";
    case "center":
      return "text-center";
    default:
      return "text-left";
  }
}

export function TerminalCell({ column, repo, rowContext }: TerminalCellProps) {
  const style =
    column.width > 0
      ? { width: column.width, minWidth: column.width, maxWidth: column.width }
      : { minWidth: 240, maxWidth: 340 };

  const numeric = NUMERIC_IDS.has(column.id);

  return (
    <td
      style={style}
      className={cn(
        "px-2 align-middle overflow-hidden",
        alignClass(column.align),
        numeric && "tabular-nums font-mono",
        column.sticky === "left" && "sticky left-0 bg-inherit z-[1]",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 items-center",
          column.align === "right" && "justify-end",
          column.align === "center" && "justify-center",
          column.align === "left" && "justify-start",
        )}
      >
        {column.render(repo, rowContext)}
      </div>
    </td>
  );
}
