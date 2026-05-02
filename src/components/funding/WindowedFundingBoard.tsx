"use client";

// Client-side 24h / 7d / 30d switcher for /funding § 02 "Top rounds".
// Server pre-windows the rounds by publishedAt age and passes three
// rendered-row arrays so the toggle is instant. We keep MoverRow on the
// server side (its CSS + types live there) — this component only owns
// state.

import { useState, type ReactNode } from "react";

export type FundingWindow = "24h" | "7d" | "30d";

interface Props {
  rows24h: ReactNode[];
  rows7d: ReactNode[];
  rows30d: ReactNode[];
  defaultWindow?: FundingWindow;
}

export function WindowedFundingBoard({
  rows24h,
  rows7d,
  rows30d,
  defaultWindow = "7d",
}: Props) {
  const [win, setWin] = useState<FundingWindow>(defaultWindow);
  const rows = win === "24h" ? rows24h : win === "30d" ? rows30d : rows7d;

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
          <span className="muted">{rows.length} rows · {win}</span>
        </span>
      </div>
      <section className="board funding-board">
        {rows.length === 0 ? (
          <div className="p-8 text-sm text-text-secondary">
            No funding signals in the {win} window yet.
          </div>
        ) : (
          rows
        )}
      </section>
    </>
  );
}
