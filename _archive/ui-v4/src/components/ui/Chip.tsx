"use client";

// V4 — Chip
//
// The reusable selectable pill used in every filter strip and tab bar.
// Mockup-canonical: 24px tall, 0 9px padding, mono caps with track 0.10em.
// Three states:
//
//   default → border line-300, bg-050, color ink-300
//   on      → solid ink-100 background, color #0a0a0a, weight 700
//   acc     → orange-on-state (used for time-window chips per signals.html)
//
// Optional content slots:
//   - leading swatch (6×6px color square — for source-color chips)
//   - leading icon (any small node)
//   - trailing count (mono 9px in ink-500)
//
// Usage:
//   <Chip on>ALL</Chip>
//   <Chip swatch="var(--v4-src-hn)">HN</Chip>
//   <Chip on count={42}>REPOS</Chip>
//   <Chip tone="acc" on>24H</Chip>
//
// Renders a <button type="button"> by default; pass `as="span"` for
// non-interactive labels (read-only filter summaries).

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ChipTone = "default" | "acc";

export interface ChipProps {
  on?: boolean;
  tone?: ChipTone;
  swatch?: string;
  icon?: ReactNode;
  count?: number | string;
  disabled?: boolean;
  /** Emit the chip as a non-interactive span (default is button). */
  as?: "button" | "span";
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}

export function Chip({
  on = false,
  tone = "default",
  swatch,
  icon,
  count,
  disabled = false,
  as = "button",
  onClick,
  className,
  children,
}: ChipProps) {
  const Tag = as;
  const baseProps =
    Tag === "button"
      ? {
          type: "button" as const,
          disabled,
          onClick,
          "aria-pressed": on,
        }
      : {};
  return (
    <Tag
      {...baseProps}
      className={cn(
        "v4-chip",
        on && "v4-chip--on",
        tone !== "default" && `v4-chip--${tone}`,
        disabled && "v4-chip--disabled",
        className,
      )}
    >
      {swatch ? (
        <span
          className="v4-chip__swatch"
          style={{ background: swatch }}
          aria-hidden="true"
        />
      ) : null}
      {icon ? (
        <span className="v4-chip__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="v4-chip__label">{children}</span>
      {count !== undefined ? (
        <span className="v4-chip__count">{count}</span>
      ) : null}
    </Tag>
  );
}
