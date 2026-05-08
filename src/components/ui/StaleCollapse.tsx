"use client";

// StaleCollapse — collapsible section that surfaces stale signals on
// source pages. Designed to fix the "23 of 6,000 — where's the rest?"
// confusion: 386 stale Twitter repos no longer disappear, they sit in a
// click-to-expand section with per-row freshness indicators.

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
  count: number; // "Stale (386)"
  label?: string; // default "Stale signals"
  description?: string; // default explanatory copy
  children: ReactNode; // the table or list of stale items
  defaultOpen?: boolean; // default false
  className?: string;
  id?: string; // for href anchor support (e.g. id="stale-section" so InventoryBand href={#stale-section} jumps here)
}

export function StaleCollapse({
  count,
  label = "Stale signals",
  description,
  children,
  defaultOpen = false,
  className,
  id,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <section
      id={id}
      className={cn(
        "border border-border-primary rounded-card bg-bg-secondary mt-4",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bg-tertiary transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="font-display text-sm font-semibold text-text-primary">
            {label}
          </span>
          <span className="font-mono text-xs text-text-tertiary">
            ({count.toLocaleString("en-US")})
          </span>
        </div>
        {description ? (
          <span className="text-[11px] text-text-tertiary">{description}</span>
        ) : null}
      </button>
      {open ? (
        <div className="px-4 pb-4 pt-0 border-t border-border-primary">
          {children}
        </div>
      ) : null}
    </section>
  );
}
