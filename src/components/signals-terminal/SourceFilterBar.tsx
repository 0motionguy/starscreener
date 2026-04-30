// URL-state-driven source filter bar.
//
// Renders 8 source chips. Click a chip → toggle that source in/out of the
// `?src=hn,gh,...` query param. With no param the default is all-on.
// Click "ALL" to clear the param.
//
// Server-side: the page reads activeSet from searchParams, filters
// SignalItem[] before passing to consensus / volume / tag-momentum / ticker.
// Per-source feed panels still render their native data — the filter is
// for the cross-source synthesis layer, not for the raw feeds.
//
// No client-side state. Each chip is a <Link>; navigation re-renders the
// server component with the new searchParams. Cheap because data-store
// refresh hooks are 30s-rate-limited.

import Link from "next/link";
import type { SourceKey } from "@/lib/signals/types";

const SOURCES: Array<{ key: SourceKey; label: string; color: string }> = [
  { key: "hn", label: "HN", color: "var(--source-hackernews)" },
  { key: "github", label: "GH", color: "var(--source-github)" },
  { key: "x", label: "X", color: "var(--source-x)" },
  { key: "reddit", label: "RDT", color: "var(--source-reddit)" },
  { key: "bluesky", label: "BSKY", color: "var(--source-bluesky)" },
  { key: "devto", label: "DEV", color: "var(--source-dev)" },
  { key: "claude", label: "CLAUDE", color: "var(--source-claude)" },
  { key: "openai", label: "OAI", color: "var(--source-openai)" },
];

const ALL_KEYS: ReadonlySet<SourceKey> = new Set(SOURCES.map((s) => s.key));

/**
 * Parse the `?src` query param into the active set. Empty / missing param
 * means "all on". Unknown tokens are ignored. Whitespace tolerant.
 */
export function parseActiveSources(raw: string | null | undefined): Set<SourceKey> {
  if (!raw || raw.trim() === "" || raw.trim().toLowerCase() === "all") {
    return new Set(ALL_KEYS);
  }
  const out = new Set<SourceKey>();
  for (const token of raw.split(",")) {
    const t = token.trim().toLowerCase() as SourceKey;
    if (ALL_KEYS.has(t)) out.add(t);
  }
  // Defensive — empty after parsing means "all on" (avoids the page rendering
  // with zero data when someone visits ?src=garbage).
  return out.size === 0 ? new Set(ALL_KEYS) : out;
}

function buildHref(active: Set<SourceKey>, toggling: SourceKey | null): string {
  // toggling=null → "ALL" reset, drops the param entirely.
  if (toggling === null) return "/signals";

  const next = new Set(active);
  if (next.has(toggling)) next.delete(toggling);
  else next.add(toggling);

  // If toggling left us with all 8 active, drop the param (canonical URL).
  if (next.size === ALL_KEYS.size) return "/signals";
  // Don't allow filtering down to zero — clicking the last active chip is a
  // no-op (returns the same URL). UX: user can't accidentally hide the page.
  if (next.size === 0) {
    const params = new URLSearchParams();
    params.set("src", Array.from(active).sort().join(","));
    return `/signals?${params.toString()}`;
  }
  const params = new URLSearchParams();
  // Sorted for stable URLs (same active set → same href regardless of order).
  params.set("src", Array.from(next).sort().join(","));
  return `/signals?${params.toString()}`;
}

export interface SourceFilterBarProps {
  active: Set<SourceKey>;
  /** Total signals across the active sources, shown on the right. */
  totalSignals: number;
}

export function SourceFilterBar({ active, totalSignals }: SourceFilterBarProps) {
  const isAllOn = active.size === ALL_KEYS.size;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        padding: "8px 10px",
        border: "1px solid var(--color-border-default)",
        background: "var(--color-bg-shell)",
        marginBottom: 10,
      }}
    >
      <span
        style={{
          fontSize: 9.5,
          letterSpacing: "0.20em",
          color: "var(--color-text-subtle)",
          textTransform: "uppercase",
          padding: "0 6px 0 2px",
          fontFamily: "var(--font-mono)",
        }}
      >
        Sources
      </span>

      {/* ALL chip — clears the param. Active when no filter is set. */}
      <Link
        href={buildHref(active, null)}
        prefetch={false}
        className={`signals-chip${isAllOn ? " signals-chip-on" : ""}`}
        aria-pressed={isAllOn}
      >
        ALL
      </Link>

      {SOURCES.map((s) => {
        const on = active.has(s.key);
        const href = buildHref(active, s.key);
        return (
          <Link
            key={s.key}
            href={href}
            prefetch={false}
            className={`signals-chip${on ? " signals-chip-on" : ""}`}
            aria-pressed={on}
          >
            <span
              aria-hidden
              className="signals-chip-dot"
              style={{ background: s.color }}
            />
            {s.label}
          </Link>
        );
      })}

      <span
        style={{
          marginLeft: "auto",
          fontSize: 9.5,
          letterSpacing: "0.16em",
          color: "var(--color-text-subtle)",
          textTransform: "uppercase",
          fontFamily: "var(--font-mono)",
        }}
      >
        {totalSignals.toLocaleString("en-US")} signals · 24h
      </span>
    </div>
  );
}

export default SourceFilterBar;
