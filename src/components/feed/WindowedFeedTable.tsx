"use client";

// Client-side 24h / 7d / 30d window switcher for event-stream sources
// (HN, Lobsters, Bluesky, dev.to, Reddit). The server pre-renders three
// pre-filtered TerminalFeedTable trees and passes them as ReactNodes;
// the client component just swaps which is mounted. Same shape as
// WindowedFundingBoard, with the "no rows" copy + heading slot
// generalised so each source page can drop it in without forking.

import { useState, type ReactNode } from "react";

export type FeedWindow = "24h" | "7d" | "30d";

interface Props {
  /** Pre-rendered table for the 24h window. */
  table24h: ReactNode;
  /** Pre-rendered table for the 7d window. */
  table7d: ReactNode;
  /** Pre-rendered table for the 30d window. */
  table30d: ReactNode;
  /** Counts per window — shown in the right-hand muted label. */
  count24h: number;
  count7d: number;
  count30d: number;
  defaultWindow?: FeedWindow;
}

export function WindowedFeedTable({
  table24h,
  table7d,
  table30d,
  count24h,
  count7d,
  count30d,
  defaultWindow = "7d",
}: Props) {
  const [win, setWin] = useState<FeedWindow>(defaultWindow);
  const table = win === "24h" ? table24h : win === "30d" ? table30d : table7d;
  const count = win === "24h" ? count24h : win === "30d" ? count30d : count7d;

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
