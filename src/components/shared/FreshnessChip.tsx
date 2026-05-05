// FreshnessChip — small per-row "Updated 8h ago" tag.
//
// AGN-450: there is exactly ONE freshness pill on each page (FreshBadge in
// the layout, FreshnessBadge in the page head). Every row / metric card
// renders signal numbers ("+1.2k stars 24h") with no age annotation, so a
// user can't tell if they're reading 30-minute fresh data or 8-hour stale
// data.
//
// This chip is the per-row companion to FreshnessBadge. It accepts a
// timestamp (ISO / epoch ms / Date) and renders a compact relative-time
// tag with three tone bands matching the AGN-450 acceptance criteria:
//   - "fresh"  (< 30 min)  → green
//   - "stale"  (≥ 1h)      → muted
//   - "cold"   (≥ 4h)      → amber
//
// Server-renderable, no hooks. Pure presentational; the timestamp is
// computed once at render against `Date.now()`. Pages with ISR
// (`revalidate`) get a new chip each window.

import type { JSX } from "react";

interface FreshnessChipProps {
  /** ISO timestamp, epoch ms, or Date — when the underlying row was fetched. */
  updatedAt: string | number | Date | null | undefined;
  /** Optional label override; defaults to "Updated". */
  label?: string;
  /** Visual size; "sm" is the default chip, "xs" is the compact in-cell tag. */
  size?: "xs" | "sm";
  /** Override the "now" reference for tests. */
  nowMs?: number;
  /** Optional override className for layout (margin, alignment). */
  className?: string;
}

type Tone = "fresh" | "stale" | "cold" | "unknown";

const FRESH_CUTOFF_MS = 30 * 60 * 1000; // 30 min — green band
const STALE_CUTOFF_MS = 4 * 60 * 60 * 1000; // 4 h — past this goes amber

interface ToneStyle {
  color: string;
  dot: string;
}

const TONE_STYLE: Record<Tone, ToneStyle> = {
  fresh: { color: "var(--v4-money, var(--sig-green, #22c55e))", dot: "var(--v4-money, var(--sig-green, #22c55e))" },
  stale: { color: "var(--v4-ink-400, var(--ink-400, #6b7280))", dot: "var(--v4-ink-400, var(--ink-400, #6b7280))" },
  cold: { color: "var(--v4-amber, var(--sig-amber, #f59e0b))", dot: "var(--v4-amber, var(--sig-amber, #f59e0b))" },
  unknown: { color: "var(--v4-ink-400, var(--ink-400, #6b7280))", dot: "var(--v4-ink-400, var(--ink-400, #6b7280))" },
};

function classifyAge(ageMs: number | null): Tone {
  if (ageMs === null) return "unknown";
  if (ageMs < FRESH_CUTOFF_MS) return "fresh";
  if (ageMs < STALE_CUTOFF_MS) return "stale";
  return "cold";
}

/**
 * Format a millisecond age as "8h ago" / "12m ago" / "live" / "2d ago".
 * Mirrors `getRelativeTime` in src/lib/utils.ts but takes a numeric age so
 * the chip can share its classification result with the formatter. Returns
 * "—" for null/unknown.
 */
function formatAge(ageMs: number | null): string {
  if (ageMs === null || !Number.isFinite(ageMs)) return "—";
  if (ageMs < 60_000) return "live";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function toMs(value: FreshnessChipProps["updatedAt"]): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export function FreshnessChip({
  updatedAt,
  label = "Updated",
  size = "sm",
  nowMs,
  className,
}: FreshnessChipProps): JSX.Element {
  const now = nowMs ?? Date.now();
  const ts = toMs(updatedAt);
  const ageMs = ts === null ? null : Math.max(0, now - ts);
  const tone = classifyAge(ageMs);
  const ageLabel = formatAge(ageMs);
  const style = TONE_STYLE[tone];

  // "live" reads better than "Updated live ago"; everything else keeps the
  // verb so the chip stays scannable at a glance.
  const text =
    tone === "unknown"
      ? `${label} —`
      : ageLabel === "live"
        ? "Just updated"
        : `${label} ${ageLabel}`;

  const fontSize = size === "xs" ? 9.5 : 10;
  const padX = size === "xs" ? 5 : 7;

  return (
    <span
      data-testid="freshness-chip"
      data-tone={tone}
      title={
        ts === null
          ? "Last update unknown"
          : `Last updated ${new Date(ts).toISOString()}`
      }
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: `1px ${padX}px`,
        borderRadius: 999,
        background: "transparent",
        color: style.color,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize,
        letterSpacing: "0.04em",
        fontWeight: 500,
        whiteSpace: "nowrap",
        lineHeight: 1.4,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          background: style.dot,
          flexShrink: 0,
        }}
      />
      {text}
    </span>
  );
}

export default FreshnessChip;

// Test seam — keep classification logic exported so unit tests can pin
// the threshold boundaries without rendering the component.
export const __test = { classifyAge, formatAge, toMs, FRESH_CUTOFF_MS, STALE_CUTOFF_MS };
