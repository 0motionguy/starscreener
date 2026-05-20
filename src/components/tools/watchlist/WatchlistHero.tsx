// WatchlistHero — server-rendered hero strip for /tools/watchlist.
//
// Renders the page-eyebrow (freshness pill wired honestly to the trending
// pipeline's lastFetchedAt), title, sub. The live watchlist count is owned
// by the client island (Zustand store is browser-side) — server seeds with
// "—" so the chrome never lies about the count before hydration.

import { classifyFreshness, getStatusLabel } from "@/lib/news/freshness";

interface WatchlistHeroProps {
  /** ISO timestamp of the last trending refresh — drives the freshness pill. */
  fetchedAt: string | null;
  /** Number of curated suggestion repos surfaced below the board. */
  suggestionCount: number;
}

export function WatchlistHero({
  fetchedAt,
  suggestionCount,
}: WatchlistHeroProps) {
  const fresh = classifyFreshness("repos", fetchedAt);
  const statusLabel = getStatusLabel(fresh.status);

  return (
    <div className="page-head wl-hero">
      <div className="wl-hero-left">
        <div className="page-eyebrow">
          <span className={`live-dot ${fresh.status}`} /> <b>{statusLabel}</b>{" "}
          &middot; scanned {fresh.ageLabel} &middot; personal watchlist
          &middot; client-side
        </div>
        <h1 className="page-title">Watchlist</h1>
        <p className="page-sub">
          Pin repos you want to track. Each row carries live stars, 24h /
          7d deltas, the cross-source mentions pip row, and any breakout
          flag the pipeline raises. Pins live in your browser&mdash;sign in
          later to sync across devices.
        </p>
      </div>
      <div className="wl-hero-right" data-watchlist-hero-counts>
        <div className="wl-pill">
          <div className="wl-pill-l">Pinned</div>
          <div className="wl-pill-v" data-watchlist-count>
            &mdash;
          </div>
          <div className="wl-pill-s">syncs on hydrate</div>
        </div>
        <div className="wl-pill">
          <div className="wl-pill-l">Suggestions</div>
          <div className="wl-pill-v">{suggestionCount}</div>
          <div className="wl-pill-s">top 7d gainers</div>
        </div>
      </div>
    </div>
  );
}
