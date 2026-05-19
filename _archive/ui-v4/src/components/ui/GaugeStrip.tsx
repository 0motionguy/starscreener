// V4 — GaugeStrip
//
// N-cell horizontal gauge. Two main configurations from the mockups:
//
//   8-cell consensus agreement strip (consensus.html)  → tone: green/dim
//     Each cell shows whether a particular signal source agreed.
//     "1" = strong (filled green), "w" = weak (30% green), "0" = absent (bg-100).
//
//   5-cell repo-detail "channels firing" strip (repo-detail.html)
//     Same primitive, different cell count.
//
// The component is data-driven: pass an array of cells, each describes its
// state and optional title (for accessibility / hover).
//
// Usage:
//   <GaugeStrip cells={[
//     { state: "on" },
//     { state: "on" },
//     { state: "on", title: "Reddit · 124 mentions" },
//     { state: "weak" },
//     { state: "off" },
//   ]} />

import { cn } from "@/lib/utils";

export type GaugeCellState = "on" | "weak" | "off";

export interface GaugeCell {
  state: GaugeCellState;
  /** Tooltip text — also used for the cell's aria-label. */
  title?: string;
}

export interface GaugeStripProps {
  cells: GaugeCell[];
  /** Width of each cell in px (mockup default 10). */
  cellWidth?: number;
  /** Height of each cell in px (mockup default 14). */
  cellHeight?: number;
  /** Gap between cells in px (mockup default 2). */
  gap?: number;
  className?: string;
}

export function GaugeStrip({
  cells,
  cellWidth = 10,
  cellHeight = 14,
  gap = 2,
  className,
}: GaugeStripProps) {
  return (
    <div
      className={cn("v4-gauge-strip", className)}
      role="img"
      aria-label={summarizeCells(cells)}
      style={{ gap: `${gap}px` }}
    >
      {cells.map((c, i) => (
        <span
          key={i}
          className={cn("v4-gauge-cell", `v4-gauge-cell--${c.state}`)}
          style={{ width: `${cellWidth}px`, height: `${cellHeight}px` }}
          title={c.title}
          aria-label={c.title}
        />
      ))}
    </div>
  );
}

function summarizeCells(cells: GaugeCell[]): string {
  const on = cells.filter((c) => c.state === "on").length;
  const weak = cells.filter((c) => c.state === "weak").length;
  return `${on} of ${cells.length} sources agree (plus ${weak} weak signals)`;
}
