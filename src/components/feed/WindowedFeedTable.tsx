"use client";

// Client-side 24h / 7d / 30d window switcher for event-stream sources
// (HN, Lobsters, Bluesky, dev.to, Reddit). Two operating modes:
//
// LEGACY (3-table) mode: parent server-renders all three TerminalFeedTable
// trees and passes them as ReactNodes; this component swaps which is mounted.
// Easy to wire but ships ~3x the HTML payload because every row of all three
// windows is serialised into the client bundle even though only one is shown.
//
// OPT-IN (active-only) mode: parent reads `?win=…` from `searchParams`,
// renders ONLY the active window's table tree, and passes it via `tableActive`
// + `activeWindow`. Tabs become real `<a href="?win=…">` links so the server
// re-renders with a different active table on click. This is the perf path —
// only ~1/3 the HTML hits the wire. Requires the page to be dynamic
// (force-static won't pick up the param).
//
// The two modes share the tab strip + counts so callers can migrate one at
// a time without coordinating a flag-day change.

import { useState, type ReactNode } from "react";

export type FeedWindow = "24h" | "7d" | "30d";

interface Props {
  /** Pre-rendered table for the 24h window. Legacy mode only. */
  table24h?: ReactNode;
  /** Pre-rendered table for the 7d window. Legacy mode only. */
  table7d?: ReactNode;
  /** Pre-rendered table for the 30d window. Legacy mode only. */
  table30d?: ReactNode;
  /** Counts per window — shown in the right-hand muted label. */
  count24h: number;
  count7d: number;
  count30d: number;
  defaultWindow?: FeedWindow;
  /**
   * Opt-in perf mode: pre-rendered table for the active window only.
   * When provided, takes precedence over table24h/7d/30d and the tab strip
   * becomes anchor links (server-driven nav) instead of state buttons.
   */
  tableActive?: ReactNode;
  /** Required when `tableActive` is set — which window the table belongs to. */
  activeWindow?: FeedWindow;
  /** URL search-param key driving active-window navigation. Default `win`. */
  windowParam?: string;
}

export function WindowedFeedTable({
  table24h,
  table7d,
  table30d,
  count24h,
  count7d,
  count30d,
  defaultWindow = "7d",
  tableActive,
  activeWindow,
  windowParam = "win",
}: Props) {
  // Opt-in mode: parent already picked the active window from searchParams.
  // We just render its table and turn the tab strip into anchor links so
  // clicking re-renders the page server-side with a different active table.
  if (tableActive !== undefined && activeWindow) {
    return (
      <>
        <div
          className="tabs"
          role="tablist"
          aria-label="Window"
          style={{ marginBottom: 8 }}
        >
          {(["24h", "7d", "30d"] as const).map((w) => (
            <a
              key={w}
              role="tab"
              aria-selected={activeWindow === w}
              className={`tab${activeWindow === w ? " on" : ""}`}
              href={`?${windowParam}=${w}`}
            >
              {w}
            </a>
          ))}
          <span className="right">
            <span className="muted">
              {countFor(activeWindow, count24h, count7d, count30d)} rows · {activeWindow}
            </span>
          </span>
        </div>
        {tableActive}
      </>
    );
  }

  return (
    <LegacyToggle
      table24h={table24h}
      table7d={table7d}
      table30d={table30d}
      count24h={count24h}
      count7d={count7d}
      count30d={count30d}
      defaultWindow={defaultWindow}
    />
  );
}

function countFor(
  win: FeedWindow,
  count24h: number,
  count7d: number,
  count30d: number,
): number {
  return win === "24h" ? count24h : win === "30d" ? count30d : count7d;
}

interface LegacyProps {
  table24h?: ReactNode;
  table7d?: ReactNode;
  table30d?: ReactNode;
  count24h: number;
  count7d: number;
  count30d: number;
  defaultWindow: FeedWindow;
}

function LegacyToggle({
  table24h,
  table7d,
  table30d,
  count24h,
  count7d,
  count30d,
  defaultWindow,
}: LegacyProps) {
  const [win, setWin] = useState<FeedWindow>(defaultWindow);
  const table = win === "24h" ? table24h : win === "30d" ? table30d : table7d;
  const count = countFor(win, count24h, count7d, count30d);

  return (
    <>
      <div
        className="tabs"
        role="tablist"
        aria-label="Window"
        style={{ marginBottom: 8 }}
      >
        {(["24h", "7d", "30d"] as const).map((w) => (
          <button
            key={w}
            type="button"
            role="tab"
            aria-selected={win === w}
            className={`tab${win === w ? " on" : ""}`}
            onClick={() => setWin(w)}
          >
            {w}
          </button>
        ))}
        <span className="right">
          <span className="muted">{count} rows · {win}</span>
        </span>
      </div>
      {table}
    </>
  );
}
