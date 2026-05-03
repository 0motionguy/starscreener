"use client";

// AUDIT-2026-05-04 follow-up: /mcp and /huggingface/* leaderboards had
// no 24h/7d/30d window switcher — they always showed a fixed "by total
// stars" or "by trending score" view. User asked for the same toggle the
// home page got, on each source page.
//
// Pre-sorted, windowed snapshots are computed server-side and passed in
// as three lists. The client just swaps which list it renders. No fetches,
// no API calls — flips instantly.

import { useState } from "react";
import { RankRow } from "@/components/ui/RankRow";

export type RankWindow = "24h" | "7d" | "30d";

export interface WindowedRow {
  /** Stable React key. */
  id: string;
  /** Where the row links to (slug page or external URL). */
  href: string;
  /** Header text — usually `${author} / ${title}` or just title. */
  title: React.ReactNode;
  /** 2-letter avatar fallback. */
  avatarText: string;
  /** Optional thumbnail src — preferred over avatarText when set. */
  avatarSrc?: string | null;
  /** Description / sub-line under the title. */
  desc: string;
  /** Right-side primary metric (e.g. "1.2k STARS"). */
  metric: { value: string; label: string };
  /** Delta pill (up/down/flat). */
  delta: { value: string; direction: "up" | "down" | "flat" };
}

interface Props {
  rows24h: WindowedRow[];
  rows7d: WindowedRow[];
  rows30d: WindowedRow[];
  /** Default window when the page first hydrates. */
  defaultWindow?: RankWindow;
}

export function WindowedRanking({
  rows24h,
  rows7d,
  rows30d,
  defaultWindow = "7d",
}: Props) {
  const [win, setWin] = useState<RankWindow>(defaultWindow);
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
      <section className="board">
        {rows.length === 0 ? (
          <div className="p-8 text-sm text-text-secondary">
            No data for the {win} window.
          </div>
        ) : (
          rows.map((row, index) => (
            <RankRow
              key={row.id}
              rank={index + 1}
              href={row.href}
              first={index === 0}
              avatar={
                row.avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="av"
                    src={row.avatarSrc}
                    alt=""
                    loading="lazy"
                    width={32}
                    height={32}
                    style={{ objectFit: "cover" }}
                  />
                ) : (
                  <span className="av">{row.avatarText}</span>
                )
              }
              title={row.title}
              desc={row.desc}
              metric={row.metric}
              delta={row.delta}
            />
          ))
        )}
      </section>
    </>
  );
}
