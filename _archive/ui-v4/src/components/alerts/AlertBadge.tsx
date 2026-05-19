// V4 — AlertBadge
//
// Sidebar nav badge showing unread alert count. Renders nothing when count
// is 0 to keep the sidebar tidy. Mockup: signals.html sidebar has an
// `ALERTS` nav item with a yellow "3" badge — this is that primitive.
//
// Usage:
//   <AlertBadge count={3} />
//   <AlertBadge count={0} />   ← renders null
//
// Tones (locked semantic):
//   amber (default) → unread alerts pending action
//   money           → "all clear" indicator (rare; pass count + tone="money")
//   red             → critical alert escalation
//
// Visual proof: class `v4-alert-badge` with --amber color tint.

import { cn } from "@/lib/utils";

export type AlertBadgeTone = "amber" | "money" | "red";

export interface AlertBadgeProps {
  count: number;
  tone?: AlertBadgeTone;
  /** Compact mode (smaller pill, used in tight nav rows). */
  compact?: boolean;
  className?: string;
}

export function AlertBadge({
  count,
  tone = "amber",
  compact = false,
  className,
}: AlertBadgeProps) {
  if (count <= 0) return null;
  const display = count > 99 ? "99+" : String(count);
  return (
    <span
      className={cn(
        "v4-alert-badge",
        `v4-alert-badge--${tone}`,
        compact && "v4-alert-badge--compact",
        className,
      )}
      aria-label={`${count} unread alert${count === 1 ? "" : "s"}`}
    >
      {display}
    </span>
  );
}
