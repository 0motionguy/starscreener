"use client";

// FieldTooltip — accessible inline help tooltip for form-field labels.
//
// Why custom (not Radix): the repo has no @radix-ui/react-tooltip dep, and
// the alert-rules dialog already avoids Radix in favor of native <dialog>
// (see ConfirmDialog / AddAlertRuleDialog). Pulling Radix in just for a
// hover bubble would burn 30+ kB and break that convention.
//
// Behavior:
//   - Trigger is a <button type="button"> wrapping an Info icon. Buttons get
//     keyboard focus for free; users can tab to the icon and the bubble
//     appears on `:focus-visible`. Hover with a mouse also reveals it.
//   - Bubble is rendered absolutely-positioned. `role="tooltip"` + an
//     `aria-describedby` link back from the trigger gives screen readers
//     the description on focus.
//   - No portal needed — the bubble lives next to the icon, and the parent
//     <fieldset> doesn't clip overflow.

import { useId } from "react";
import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

export interface FieldTooltipProps {
  /** Human label of the field this tooltip describes (a11y context only). */
  label: string;
  /** Description copy shown on hover/focus. */
  content: string;
  /** Optional override for the tooltip placement. Defaults to "right". */
  side?: "right" | "left" | "top";
  className?: string;
}

export function FieldTooltip({
  label,
  content,
  side = "right",
  className,
}: FieldTooltipProps) {
  const id = useId();
  const tooltipId = `${id}-tip`;

  const sidePositionClass =
    side === "left"
      ? "right-full top-1/2 -translate-y-1/2 mr-2"
      : side === "top"
        ? "bottom-full left-1/2 -translate-x-1/2 mb-2"
        : "left-full top-1/2 -translate-y-1/2 ml-2";

  return (
    <span className={cn("relative inline-flex group", className)}>
      <button
        type="button"
        // Native title gives a baseline fallback (e.g. when the popup is
        // hidden by an OS-level forced-colors override).
        title={`${label}: ${content}`}
        aria-describedby={tooltipId}
        aria-label={`More info about ${label}`}
        className={cn(
          "inline-flex items-center justify-center rounded-[2px] p-0.5",
          "cursor-help focus:outline-none focus-visible:ring-1",
          "focus-visible:ring-[var(--v3-acc)]",
        )}
      >
        <Info
          className="h-3.5 w-3.5 opacity-70 transition-opacity group-hover:opacity-100"
          style={{ color: "var(--v3-ink-300)" }}
          aria-hidden
        />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          // Hidden by default; revealed on hover of the wrapper OR focus of
          // the trigger button. Pointer-events-none keeps it from blocking
          // clicks on neighbouring fields.
          "pointer-events-none absolute z-50 w-64 rounded-[2px] border px-2.5 py-1.5",
          "font-mono text-[11px] leading-snug",
          "opacity-0 transition-opacity duration-150",
          "group-hover:opacity-100 group-focus-within:opacity-100",
          sidePositionClass,
        )}
        style={{
          background: "var(--v3-bg-100)",
          borderColor: "var(--v3-line-200)",
          color: "var(--v3-ink-200)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
        }}
      >
        {content}
      </span>
    </span>
  );
}

export default FieldTooltip;
