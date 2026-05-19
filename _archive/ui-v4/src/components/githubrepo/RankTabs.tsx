"use client";

// /githubrepo tab strip.
//
// Renders four rankings of the same 50ish repos, swap-on-click client-side
// (no route navigation, no server re-render). Each tab supplies a pre-built
// LiveRow[] computed server-side; this wrapper just picks which to feed
// LiveTopTable.
//
// Initial active tab can be deep-linked via ?rank=trending|oss|trendshift|momentum.

import { useEffect, useMemo, useState } from "react";
import {
  LiveTopTable,
  type CategoryFacet,
  type LiveRow,
} from "@/components/home/LiveTopTable";

export type RankMode = "trending" | "oss" | "trendshift" | "momentum";

const MODES: ReadonlyArray<{
  id: RankMode;
  label: string;
  blurb: string;
}> = [
  {
    id: "trending",
    label: "Trending",
    blurb: "OSS Insight + TrendShift fused (Reciprocal Rank Fusion).",
  },
  {
    id: "oss",
    label: "OSS Insight",
    blurb: "OSS Insight 24h trending — total_score desc.",
  },
  {
    id: "trendshift",
    label: "TrendShift",
    blurb: "TrendShift daily top 100 — scraped rank.",
  },
  {
    id: "momentum",
    label: "Momentum",
    blurb: "Our composite score (24h/7d velocity, social, freshness).",
  },
];

export interface RankTabsProps {
  /** Pre-computed rows per mode, sorted in display order. */
  rowsByMode: Record<RankMode, LiveRow[]>;
  /** Pre-computed category facet counts per mode. */
  categoriesByMode: Record<RankMode, CategoryFacet[]>;
  /** Per-mode source-freshness label for the meta strip. */
  sourceMetaByMode: Record<RankMode, string>;
}

function readInitialMode(): RankMode {
  if (typeof window === "undefined") return "trending";
  const params = new URLSearchParams(window.location.search);
  const candidate = params.get("rank");
  if (
    candidate === "trending" ||
    candidate === "oss" ||
    candidate === "trendshift" ||
    candidate === "momentum"
  ) {
    return candidate;
  }
  return "trending";
}

export function RankTabs({
  rowsByMode,
  categoriesByMode,
  sourceMetaByMode,
}: RankTabsProps) {
  const [active, setActive] = useState<RankMode>("trending");

  // Read URL param after mount so SSR output stays deterministic.
  useEffect(() => {
    setActive(readInitialMode());
  }, []);

  const onPick = (mode: RankMode) => {
    setActive(mode);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (mode === "trending") url.searchParams.delete("rank");
      else url.searchParams.set("rank", mode);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const rows = rowsByMode[active];
  const categories = categoriesByMode[active];
  const meta = sourceMetaByMode[active];
  const blurb = useMemo(
    () => MODES.find((m) => m.id === active)?.blurb ?? "",
    [active],
  );

  return (
    <div className="rank-tabs">
      <div
        className="rank-tabs-strip"
        role="tablist"
        aria-label="Ranking source"
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={active === m.id}
            className={`rank-tab ${active === m.id ? "on" : ""}`}
            onClick={() => onPick(m.id)}
          >
            {m.label}
          </button>
        ))}
        <span className="rank-tabs-spacer" />
        <span className="rank-tabs-meta">{meta}</span>
      </div>
      <p className="rank-tabs-blurb">{blurb}</p>
      <LiveTopTable rows={rows} categories={categories} />
      <style>{`
        .rank-tabs { display: flex; flex-direction: column; gap: 10px; }
        .rank-tabs-strip {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          border-bottom: 1px solid var(--v4-line-100, rgba(255,255,255,0.08));
          padding-bottom: 6px;
        }
        .rank-tab {
          font: inherit;
          font-family: var(--font-geist-mono, monospace);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 7px 12px;
          border: 1px solid var(--v4-line-100, rgba(255,255,255,0.08));
          border-radius: 4px;
          background: transparent;
          color: var(--v4-ink-300, rgba(255,255,255,0.7));
          cursor: pointer;
          transition: color 120ms, background 120ms, border-color 120ms;
        }
        .rank-tab:hover {
          color: var(--v4-ink-100, #fff);
          border-color: var(--v4-line-200, rgba(255,255,255,0.16));
        }
        .rank-tab.on {
          color: var(--v4-ink-000, #fff);
          background: var(--v4-bg-050, rgba(255,255,255,0.04));
          border-color: var(--v4-acc, #ffcb05);
          box-shadow: inset 0 -2px 0 var(--v4-acc, #ffcb05);
        }
        .rank-tabs-spacer { flex: 1; }
        .rank-tabs-meta {
          font-family: var(--font-geist-mono, monospace);
          font-size: 11px;
          color: var(--v4-ink-400, rgba(255,255,255,0.55));
          letter-spacing: 0.06em;
        }
        .rank-tabs-blurb {
          margin: 0;
          font-size: 12px;
          color: var(--v4-ink-300, rgba(255,255,255,0.7));
          font-family: var(--font-geist-mono, monospace);
          letter-spacing: 0.02em;
        }
      `}</style>
    </div>
  );
}
