// V4 — LiveTape
//
// Container for funding.html § 04 "Live tape · all sources". Wraps a list
// of <DealTapeRow> items and provides the scrolling area + a mockup-
// canonical max-height with custom scrollbar. Pure layout primitive.
//
// Usage:
//   <LiveTape>
//     {deals.map(d => <DealTapeRow key={d.id} {...d} />)}
//   </LiveTape>

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface LiveTapeProps {
  /** Tape body — typically <DealTapeRow /> children. */
  children: ReactNode;
  /** Constrain to a scrollable height (default 520px). 0 = no max-height. */
  maxHeight?: number;
  className?: string;
}

export function LiveTape({
  children,
  maxHeight = 520,
  className,
}: LiveTapeProps) {
  return (
    <div
      className={cn("v4-live-tape", className)}
      style={maxHeight > 0 ? { maxHeight: `${maxHeight}px` } : undefined}
      role="feed"
      aria-busy="false"
      aria-label="Live deal tape"
    >
      {children}
    </div>
  );
}
