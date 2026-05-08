"use client";

// FilterPills — pill-chip group with active state for filter controls.
//
// Replaces inline text-link filter rows on /signals, /twitter, /lobsters,
// /devto, etc. Each pill renders as either:
//   - <Link>  when `href` is given (navigation-style filter)
//   - <button> when `onClick` is given (in-page state)
//   - <span>  when neither is given (read-only summary)
//
// Mobile-friendly: wraps onto multiple rows via flex-wrap.
// Active pill: solid accent background, dark foreground.
// Inactive pill: subtle bg-secondary surface, secondary text, hover lifts.
//
// Sibling of `Chip` / `ChipGroup` (V4 mockup-styled). FilterPills is the
// V3 round-pill variant used in feed-page filter strips.

import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface FilterPill {
  /** Stable identifier — matched against `activeId`. */
  id: string;
  /** Visible label. */
  label: ReactNode;
  /** Optional badge count rendered after the label. */
  count?: number;
  /** When supplied, pill renders as a <Link>. */
  href?: string;
  /** When supplied (and `href` is absent), pill renders as a <button>. */
  onClick?: () => void;
  /** Optional leading icon node (lucide icon, swatch, etc.). */
  icon?: ReactNode;
  /** Disable interaction (button/link become inert). */
  disabled?: boolean;
}

interface Props {
  pills: FilterPill[];
  /** ID of the currently-active pill — applied to the matching entry. */
  activeId?: string;
  /** ARIA label for the surrounding navigation/toolbar. */
  ariaLabel?: string;
  className?: string;
}

const basePill = cn(
  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono",
  "border border-border-default whitespace-nowrap select-none",
  "transition-colors duration-150",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v4-acc)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-bg-primary)]",
);

const activePill = cn(
  "bg-[var(--v4-acc)] text-[var(--color-bg-canvas)] border-[var(--v4-acc)]",
  "shadow-[0_0_0_1px_var(--v4-acc-glow)]",
);

const inactivePill = cn(
  "bg-bg-secondary text-text-subtle",
  "hover:bg-bg-tertiary hover:text-text-default hover:border-border-strong",
);

const disabledPill = "opacity-50 pointer-events-none";

export function FilterPills({
  pills,
  activeId,
  ariaLabel,
  className,
}: Props) {
  return (
    <nav
      aria-label={ariaLabel ?? "Filter"}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {pills.map((pill) => {
        const isActive = pill.id === activeId;
        const classes = cn(
          basePill,
          isActive ? activePill : inactivePill,
          pill.disabled && disabledPill,
        );
        const inner = (
          <>
            {pill.icon ? (
              <span className="inline-flex shrink-0" aria-hidden="true">
                {pill.icon}
              </span>
            ) : null}
            <span>{pill.label}</span>
            {typeof pill.count === "number" ? (
              <span
                className={cn(
                  "ml-0.5 rounded-full px-1.5 text-[10px] tabular-nums",
                  isActive
                    ? "bg-[var(--color-bg-canvas)]/20 text-[var(--color-bg-canvas)]"
                    : "bg-bg-tertiary text-text-faint",
                )}
              >
                {pill.count}
              </span>
            ) : null}
          </>
        );

        if (pill.href && !pill.disabled) {
          return (
            <Link
              key={pill.id}
              href={pill.href}
              className={classes}
              aria-current={isActive ? "page" : undefined}
            >
              {inner}
            </Link>
          );
        }
        if (pill.onClick) {
          return (
            <button
              key={pill.id}
              type="button"
              onClick={pill.onClick}
              disabled={pill.disabled}
              className={classes}
              aria-pressed={isActive}
            >
              {inner}
            </button>
          );
        }
        return (
          <span
            key={pill.id}
            className={classes}
            aria-current={isActive ? "true" : undefined}
          >
            {inner}
          </span>
        );
      })}
    </nav>
  );
}

export default FilterPills;
