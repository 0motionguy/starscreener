// V4 — CornerDots
//
// Three colored 4×4px squares used as a decorative corner marker on every
// PanelHead. Mockup-canonical — orange / cyan / ink for the brand /
// secondary / muted decoration. Always at 70% opacity to read as a "wink"
// rather than a shout.
//
// Usage:
//   <CornerDots />
//
// Lives inside <PanelHead>; standalone usage is rare but exported so
// special panels can place them custom.

import { cn } from "@/lib/utils";

export interface CornerDotsProps {
  className?: string;
}

export function CornerDots({ className }: CornerDotsProps) {
  return (
    <span className={cn("v4-corner-dots", className)} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
