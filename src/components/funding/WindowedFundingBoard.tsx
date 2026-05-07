"use client";

// Client-side 24h / 7d / 30d switcher for /funding § 02 "Top rounds".
// Server pre-windows the rounds by publishedAt age and passes three
// rendered-row arrays so the toggle is instant. We keep MoverRow on the
// server side (its CSS + types live there) — this component only owns
// state.
//
// 2026-05-07 polish (A3): tighter terminal-style header (mono uppercase
// counter), proper empty state with mono divider rule that matches the
// rest of the funding board rhythm. Removes the bare "0 rows · 7d" line
// that read like a debug log when a window had no data.

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
          <span
            className="muted"
            style={{
              fontFamily: "var(--v4-mono)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontSize: "9.5px",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {String(rows.length).padStart(2, "0")} ROUNDS · {win.toUpperCase()}
          </span>
        </span>
      </div>
      <section className="board funding-board">
        {rows.length === 0 ? (
          <div
            style={{
              padding: "28px 16px",
              textAlign: "center",
              fontFamily: "var(--v4-mono)",
              fontSize: "11px",
              color: "var(--v4-ink-400)",
              letterSpacing: "0.06em",
              borderTop: "1px dashed var(--v4-line-200)",
              borderBottom: "1px dashed var(--v4-line-200)",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                letterSpacing: "0.18em",
                color: "var(--v4-ink-300)",
                marginBottom: 4,
                textTransform: "uppercase",
              }}
            >
              · NO SIGNALS ·
            </div>
            no funding rounds in the {win} window — try a wider range
          </div>
        ) : (
          rows
        )}
      </section>
    </>
  );
}
