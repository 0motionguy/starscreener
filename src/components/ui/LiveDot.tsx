// V4 — LiveDot
//
// The pulsing green status dot that appears next to "LIVE" labels across
// every panel head, KPI band, and ticker. Single source of truth for the
// pulse animation so we don't end up with eight slightly-different pulse
// keyframes scattered across components.
//
// Usage:
//   <LiveDot />                            ← default green pulse
//   <LiveDot tone="amber" label="STALE" /> ← amber, no pulse, used for warn
//
// Tones:
//   - money (default) → green, pulses
//   - amber          → solid amber, no pulse, no glow halo
//   - red            → solid red, no pulse, used for "DOWN" indicator
//   - none           → flat, no pulse — for placeholder states

import { cn } from "@/lib/utils";

export type LiveDotTone = "money" | "amber" | "red" | "none";

export interface LiveDotProps {
  tone?: LiveDotTone;
  /** Optional label rendered after the dot (e.g. "LIVE", "STALE"). */
  label?: string;
  className?: string;
}

export function LiveDot({ tone = "money", label, className }: LiveDotProps) {
  return (
    <span
      className={cn("v4-live-dot", `v4-live-dot--${tone}`, className)}
      role="status"
      aria-live="polite"
    >
      <i className="v4-live-dot__pip" aria-hidden="true" />
      {label ? <span className="v4-live-dot__label">{label}</span> : null}
    </span>
  );
}
