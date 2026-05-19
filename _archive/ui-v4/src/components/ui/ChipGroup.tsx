// V4 — ChipGroup
//
// Container for a row of <Chip> filters with an optional left label and
// optional inter-group divider. Mockup pattern repeats throughout
// signals.html, consensus.html, funding.html — always:
//
//   SOURCES  [chip] [chip] [chip] | WINDOW  [chip] [chip] | TOPIC  [chip] [chip]
//
// `divider` between consecutive groups renders a 18px-tall vertical line
// in line-200 with 6px gutters.
//
// Usage:
//   <ChipGroup label="SOURCES">
//     {sources.map(s => <Chip key={s} swatch={...}>{s}</Chip>)}
//   </ChipGroup>
//
//   <ChipGroup divider />     ← inter-group spacer
//
//   <ChipGroup label="WINDOW" rightSlot={<span>42,184 signals · 24h</span>}>
//     ...
//   </ChipGroup>

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface ChipGroupProps {
  label?: ReactNode;
  /** When true, renders a single divider line and no children — used between groups. */
  divider?: boolean;
  /** Optional right-aligned slot — for "42,184 signals · 24h" style summary text. */
  rightSlot?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function ChipGroup({
  label,
  divider = false,
  rightSlot,
  className,
  children,
}: ChipGroupProps) {
  if (divider) {
    return <span className="v4-chip-group__divider" aria-hidden="true" />;
  }
  return (
    <div
      className={cn("v4-chip-group", className)}
      role="group"
      aria-label={typeof label === "string" ? label : undefined}
    >
      {label ? <span className="v4-chip-group__label">{label}</span> : null}
      <div className="v4-chip-group__items">{children}</div>
      {rightSlot ? (
        <span className="v4-chip-group__right">{rightSlot}</span>
      ) : null}
    </div>
  );
}

// FilterBar — convenience wrapper that wraps ChipGroups in the V4 filter
// row chrome (border, bg-025, padding). Drop this in any page that has a
// horizontal filter strip.
export interface FilterBarProps {
  className?: string;
  children: ReactNode;
}

export function FilterBar({ className, children }: FilterBarProps) {
  return (
    <div className={cn("v4-filter-bar", className)} role="toolbar">
      {children}
    </div>
  );
}
