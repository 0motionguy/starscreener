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

export type TimeWindow = "1h" | "24h" | "7d" | "30d";

interface WindowSpec {
  key: TimeWindow;
  label: string;
  hours: number;
}

const WINDOWS: WindowSpec[] = [
  { key: "1h", label: "1H", hours: 1 },
  { key: "24h", label: "24H", hours: 24 },
  { key: "7d", label: "7D", hours: 168 },
  { key: "30d", label: "30D", hours: 720 },
];

const WINDOW_BY_KEY: Record<TimeWindow, WindowSpec> = Object.fromEntries(
  WINDOWS.map((w) => [w.key, w]),
) as Record<TimeWindow, WindowSpec>;

/** Default window when ?w is missing / invalid. */
export const DEFAULT_WINDOW: TimeWindow = "24h";

/**
 * Parse the `?w` query param into a TimeWindow. Empty / missing / unknown
 * → DEFAULT_WINDOW so the page always has a valid lookback.
 */
export function parseTimeWindow(raw: string | null | undefined): TimeWindow {
  if (!raw) return DEFAULT_WINDOW;
  const t = raw.trim().toLowerCase() as TimeWindow;
  if (t in WINDOW_BY_KEY) return t;
  return DEFAULT_WINDOW;
}

/** Convert a TimeWindow to a number of hours. */
export function windowHours(w: TimeWindow): number {
  return WINDOW_BY_KEY[w].hours;
}

/** Human label for the active window (used in KPI copy). */
export function windowLabel(w: TimeWindow): string {
  return WINDOW_BY_KEY[w].label;
}

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

/**
 * Compose a /signals href that preserves the current source + window state
 * but applies a single override. Used by both source toggles and window
 * switches so each chip click stays inside the user's current filter.
 */
function makeHref(
  source: Set<SourceKey>,
  timeWindow: TimeWindow,
  override: { source?: Set<SourceKey>; timeWindow?: TimeWindow },
): string {
  const finalSource = override.source ?? source;
  const finalWindow = override.timeWindow ?? timeWindow;

  const params = new URLSearchParams();
  if (finalSource.size !== ALL_KEYS.size && finalSource.size > 0) {
    params.set("src", Array.from(finalSource).sort().join(","));
  }
  if (finalWindow !== DEFAULT_WINDOW) {
    params.set("w", finalWindow);
  }
  const qs = params.toString();
  return qs ? `/signals?${qs}` : "/signals";
}

function buildSourceHref(
  active: Set<SourceKey>,
  timeWindow: TimeWindow,
  toggling: SourceKey | null,
): string {
  // toggling=null → "ALL" reset (clear source filter, keep window).
  if (toggling === null) {
    return makeHref(active, timeWindow, { source: new Set(ALL_KEYS) });
  }

  const next = new Set(active);
  if (next.has(toggling)) next.delete(toggling);
  else next.add(toggling);

  // Don't allow filtering down to zero — clicking the last active chip is
  // a no-op so the user can't accidentally hide the page.
  if (next.size === 0) {
    return makeHref(active, timeWindow, { source: active });
  }
  return makeHref(active, timeWindow, { source: next });
}

function buildWindowHref(
  source: Set<SourceKey>,
  current: TimeWindow,
  target: TimeWindow,
): string {
  if (current === target) return makeHref(source, current, {});
  return makeHref(source, current, { timeWindow: target });
}

export interface SourceFilterBarProps {
  active: Set<SourceKey>;
  /** Renamed from `window` to dodge the global-name shadow in RSC bundling. */
  timeWindow: TimeWindow;
  /** Total signals across the active sources/window, shown on the right. */
  totalSignals: number;
}

export function SourceFilterBar({
  active,
  timeWindow,
  totalSignals,
}: SourceFilterBarProps) {
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

      {/* ALL chip — clears the source filter. Active when nothing filtered. */}
      <Link
        href={buildSourceHref(active, timeWindow, null)}
        prefetch={false}
        className={`signals-chip${isAllOn ? " signals-chip-on" : ""}`}
        aria-pressed={isAllOn}
      >
        ALL
      </Link>

      {SOURCES.map((s) => {
        const on = active.has(s.key);
        return (
          <Link
            key={s.key}
            href={buildSourceHref(active, timeWindow, s.key)}
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

      <span className="signals-chip-sep" aria-hidden />

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
        Window
      </span>
      {WINDOWS.map((w) => {
        const on = w.key === timeWindow;
        return (
          <Link
            key={w.key}
            href={buildWindowHref(active, timeWindow, w.key)}
            prefetch={false}
            className={`signals-chip signals-chip-time${on ? " signals-chip-on" : ""}`}
            aria-pressed={on}
          >
            {w.label}
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
        {totalSignals.toLocaleString("en-US")} signals · {windowLabel(timeWindow)}
      </span>
    </div>
  );
}

export default SourceFilterBar;
