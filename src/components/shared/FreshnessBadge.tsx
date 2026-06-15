// FreshnessBadge — small V4 pill that surfaces classifyFreshness() output.
// W4-FRESHBADGE / audit Top 5 #5 / F1.
//
// Routes were rendering data with no visible age, so a user couldn't tell
// 30-min fresh from 4h stale. This badge wraps `classifyFreshness()`
// (single source of truth for live/warn/cold) and renders it as a compact
// mono pill at request time.
//
// Server-renderable. Static "as of X" — no client tick. Per the F1 spec:
// one badge per page, rendered next to the existing PageHead clock.

import { classifyFreshness, type NewsSource } from "@/lib/news/freshness";

// Operator decision (2026-06-15, ULTRA plan §F4): visible recency stamp
// is part of the "no publicly stale batches" rule. Show by default so
// readers can tell a fresh batch from a 4h-old one without opening the
// route. The hide flag stays available — set
// `NEXT_PUBLIC_HIDE_FRESHNESS_BADGES=true` to opt out.
function isFreshnessBadgeHidden(): boolean {
  return process.env.NEXT_PUBLIC_HIDE_FRESHNESS_BADGES === "true";
}

interface FreshnessBadgeProps {
  /** ISO timestamp, epoch ms, or Date — when the underlying data was fetched. */
  lastUpdatedAt: string | number | Date | null | undefined;
  /** Which source threshold to apply. Routes pick the NewsSource closest to
   * their cron cadence (e.g. `mcp`/`skills` for slow-cron Redis feeds). */
  source: NewsSource;
  /** Stable render timestamp for Client Component hydration. */
  nowMs?: number;
}

const TONE: Record<"live" | "warn" | "cold", { color: string; label: string }> = {
  live: { color: "var(--v4-money)", label: "FRESH" },
  warn: { color: "var(--v4-amber)", label: "STALE" },
  cold: { color: "var(--v4-red)", label: "COLD" },
};

export function FreshnessBadge({
  lastUpdatedAt,
  source,
  nowMs,
}: FreshnessBadgeProps) {
  if (isFreshnessBadgeHidden()) return null;
  const iso =
    lastUpdatedAt instanceof Date
      ? lastUpdatedAt.toISOString()
      : typeof lastUpdatedAt === "number"
        ? new Date(lastUpdatedAt).toISOString()
        : (lastUpdatedAt ?? null);
  const verdict = classifyFreshness(source, iso, nowMs);
  const tone = TONE[verdict.status];
  return (
    <span
      title={`Last updated ${iso ?? "unknown"} · ${verdict.status} · stale after ${Math.round(verdict.staleAfterMs / 60000)}m`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        border: `1px solid ${tone.color}`,
        borderRadius: "var(--v4-radius-pill, 999px)",
        background: "var(--v4-bg-050)",
        color: tone.color,
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        fontWeight: 600,
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: tone.color }} />
      {tone.label} · {verdict.ageLabel}
    </span>
  );
}

export default FreshnessBadge;
