"use client";

// MobileRadarScreen — the app-native home feed (replaces the desktop hero +
// chart + featured + table on mobile). Mode (Top/Gainers/Trend/Discovery) and
// window (1H/24H/7D/30D) are segmented links that set ?rank / ?window and let
// the server re-sort — the exact same URL contract the desktop control bar
// uses, so there is no client-side re-ranking and no duplicate fetch. Cards
// are the shared RepoCardModel[] the server already computed.
//
// Uses usePathname (no Suspense needed) + the current params passed as a prop,
// deliberately avoiding useSearchParams so the ISR home route is not forced
// into client bailout.

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MobileRepoCard } from "./MobileRepoCard";
import type { RepoCardModel } from "@/lib/mobile/repo-card-model";

const MODES = [
  { id: "top", label: "Top" },
  { id: "gainer", label: "Gainers" },
  { id: "trend", label: "Trend" },
  { id: "discovery", label: "Discovery" },
];
const WINDOWS = [
  { id: "1h", label: "1H" },
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
];
const INITIAL = 15;
const STEP = 10;

interface MobileRadarScreenProps {
  cards: RepoCardModel[];
  activeRanker: string;
  activeWindow: string;
  params: Record<string, string>;
}

export function MobileRadarScreen({ cards, activeRanker, activeWindow, params }: MobileRadarScreenProps) {
  const pathname = usePathname();
  const [limit, setLimit] = useState(INITIAL);

  const hrefWith = (key: string, value: string): string => {
    const p = new URLSearchParams(params);
    p.set(key, value);
    const q = p.toString();
    return q ? `${pathname}?${q}` : pathname;
  };

  const shown = cards.slice(0, limit);

  return (
    <section className="mapp-radar" aria-label="Trending feed">
      {/* No heading here — the app header owns the "Radar" title (one
          consistent top header across every screen). */}
      <div className="mapp-seg" role="tablist" aria-label="Ranking mode">
        {MODES.map((m) => (
          <Link
            key={m.id}
            href={hrefWith("rank", m.id)}
            scroll={false}
            role="tab"
            aria-selected={activeRanker === m.id}
            className={`mapp-seg-item${activeRanker === m.id ? " on" : ""}`}
          >
            {m.label}
          </Link>
        ))}
      </div>

      <div className="mapp-seg mapp-seg-window" role="tablist" aria-label="Time window">
        {WINDOWS.map((w) => (
          <Link
            key={w.id}
            href={hrefWith("window", w.id)}
            scroll={false}
            role="tab"
            aria-selected={activeWindow === w.id}
            className={`mapp-seg-item${activeWindow === w.id ? " on" : ""}`}
          >
            {w.label}
          </Link>
        ))}
      </div>

      <div className="mapp-feed">
        {shown.length > 0 ? (
          shown.map((c) => <MobileRepoCard key={c.id} model={c} />)
        ) : (
          <div className="mapp-feed-empty">No repos in this view yet — try another mode or window.</div>
        )}
      </div>

      {limit < cards.length ? (
        <button
          type="button"
          className="mapp-feed-more"
          onClick={() => setLimit((l) => Math.min(l + STEP, cards.length))}
        >
          Load more ({cards.length - limit})
        </button>
      ) : null}
    </section>
  );
}
