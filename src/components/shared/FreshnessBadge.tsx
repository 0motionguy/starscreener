// FreshnessBadge — small V4 pill that surfaces classifyFreshness() output.
//
// Audit Top 5 #5 / F1: routes were rendering data with no visible age, so a
// user couldn't tell 30-min fresh from 4h stale. This badge wraps
// `classifyFreshness()` (single source of truth for live/warn/cold) and
// renders it as a compact mono pill at request time.
//
// Server-renderable. Static "as of X" — no client tick. Per the F1 spec:
// one badge per page, rendered next to the existing PageHead clock.

import { classifyFreshness, type NewsSource } from "@/lib/news/freshness";

interface FreshnessBadgeProps {
  /** ISO timestamp, epoch ms, or Date — when the underlying data was fetched. */
  lastUpdatedAt: string | number | Date | null | undefined;
  /** Which source threshold to apply. Routes pick the NewsSource closest to
   * their cron cadence (e.g. `mcp`/`skills` for slow-cron Redis feeds). */
  source: NewsSource;
}

const TONE: Record<"live" | "warn" | "cold", { color: string; label: string }> = {
  live: { color: "var(--v4-money)", label: "FRESH" },
  warn: { color: "var(--v4-amber)", label: "STALE" },
  cold: { color: "var(--v4-red)", label: "COLD" },
};

export function FreshnessBadge({ lastUpdatedAt, source }: FreshnessBadgeProps) {
  const iso =
    lastUpdatedAt instanceof Date
      ? lastUpdatedAt.toISOString()
      : typeof lastUpdatedAt === "number"
        ? new Date(lastUpdatedAt).toISOString()
        : (lastUpdatedAt ?? null);
  const verdict = classifyFreshness(source, iso);
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
