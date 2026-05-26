// /tools/watchlist — personal Zustand-backed watchlist surface.
//
// Server-component shell: refreshes the trending pipeline once, builds a
// `reposById` lookup so the <WatchlistClient> island can join the persisted
// `{ repoId, fullName, addedAt, starsAtAdd }` items against live Repo data
// without a second client round-trip, and picks 6 curated suggestions from
// the top 7d gainers.
//
// The 'use client' boundary lives on <WatchlistClient>, not on this file —
// that keeps the hero + suggestion tiles RSC + cacheable while the
// localStorage-backed Zustand store stays browser-only.
//
// 5-minute ISR matches the rest of the /tools/* surfaces — the trending
// pipeline cron writes every 3h, so 5m is comfortably inside the freshness
// budget while still letting deploys flush the cache.

import type { Metadata } from "next";
import Link from "next/link";

import { WatchlistClient } from "@/components/tools/watchlist/WatchlistClient";
import { WatchlistHero } from "@/components/tools/watchlist/WatchlistHero";
import { WatchlistSuggestions } from "@/components/tools/watchlist/WatchlistSuggestions";
import { getDerivedRepos } from "@/lib/derived-repos";
import { getLastFetchedAt, refreshTrendingFromStore } from "@/lib/trending";
import type { Repo } from "@/lib/types";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Watchlist — TrendingRepo",
  description:
    "Pin the repos you want to track. Each pin shows live stars, 24h / 7d deltas, cross-source mentions, and breakout flags. Pins live in your browser; sign in to sync.",
  openGraph: {
    images: [
      { url: "/api/og/tools/watchlist", width: 1200, height: 630 },
    ],
  },
};

const SUGGESTION_LIMIT = 6;

function pickSuggestions(repos: Repo[], limit = SUGGESTION_LIMIT): Repo[] {
  return [...repos]
    .filter((r) => typeof r.fullName === "string" && r.fullName.includes("/"))
    .sort((a, b) => (b.starsDelta7d ?? 0) - (a.starsDelta7d ?? 0))
    .slice(0, limit);
}

function buildReposById(repos: Repo[]): Record<string, Repo> {
  const out: Record<string, Repo> = {};
  for (const repo of repos) {
    if (repo.id) out[repo.id] = repo;
  }
  return out;
}

export default async function WatchlistPage() {
  // Refresh once at the top per the data-store pattern — internal rate-limit
  // + in-flight dedupe make this cheap to call on every render.
  await refreshTrendingFromStore().catch(() => {
    /* graceful — derived-repos falls back to bundled JSON. */
  });

  let allRepos: Repo[] = [];
  try {
    allRepos = getDerivedRepos();
  } catch {
    allRepos = [];
  }

  const suggestions = pickSuggestions(allRepos);
  const reposById = buildReposById(allRepos);
  const fetchedAt = (() => {
    try {
      return getLastFetchedAt() ?? null;
    } catch {
      return null;
    }
  })();

  return (
    <div className="watchlist-tool">
      <WatchlistPageStyles />

      <WatchlistHero
        fetchedAt={fetchedAt}
        suggestionCount={suggestions.length}
      />

      <WatchlistClient reposById={reposById} fetchedAt={fetchedAt} />

      <WatchlistSuggestions repos={suggestions} />

      <p className="wl-sync-note">
        Pins are stored locally in your browser.{" "}
        <Link href="/sign-in" className="wl-sync-link" prefetch={false}>
          Sign in
        </Link>{" "}
        to sync your watchlist across devices.
      </p>
    </div>
  );
}

function WatchlistPageStyles() {
  return (
    <style>{`
      /* Wave-2 watchlist page chrome.
         Inherits page-head / page-eyebrow / page-title / page-sub from
         shell.css. Component-scoped rules below cover the hero pill grid
         + the suggestions strip (the in-board table chrome lives in
         WatchlistClient.tsx so it stays co-located with the markup). */
      .watchlist-tool {
        padding: 18px 22px 40px;
        max-width: 1500px;
        margin: 0 auto;
      }
      .watchlist-tool .wl-hero {
        display: flex;
        gap: 22px;
        align-items: stretch;
        flex-wrap: wrap;
      }
      .watchlist-tool .wl-hero-left { flex: 1 1 460px; min-width: 0; }
      .watchlist-tool .wl-hero-right {
        display: grid;
        grid-template-columns: repeat(2, minmax(140px, 1fr));
        gap: 10px;
        align-items: stretch;
      }
      .watchlist-tool .wl-pill {
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-lg);
        padding: 14px 16px 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 140px;
      }
      .watchlist-tool .wl-pill-l {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--fg-faint);
      }
      .watchlist-tool .wl-pill-v {
        font-family: var(--font-mono);
        font-size: 22px;
        font-weight: 600;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.01em;
      }
      .watchlist-tool .wl-pill-s {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-muted);
      }

      /* Suggestions strip ---------------------------------------------- */
      .watchlist-tool .wl-suggestions {
        margin-top: 18px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-lg);
        padding: 14px 16px 16px;
      }
      .watchlist-tool .wl-suggestions .wl-eyebrow {
        display: flex;
        align-items: baseline;
        gap: 10px;
        flex-wrap: wrap;
      }
      .watchlist-tool .wl-suggestions .wl-eyebrow .num {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--accent);
        letter-spacing: 0.10em;
        font-weight: 600;
      }
      .watchlist-tool .wl-suggestions .wl-eyebrow .title {
        font-size: 13.5px;
        color: var(--fg-bright);
        font-weight: 500;
      }
      .watchlist-tool .wl-suggestions .wl-eyebrow .meta {
        margin-left: auto;
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
      }
      .watchlist-tool .wl-suggestions .wl-eyebrow .meta b { color: var(--fg); font-weight: 500; }
      .watchlist-tool .wl-suggestions-grid {
        margin-top: 12px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .watchlist-tool .wl-suggestions-empty {
        margin-top: 12px;
        padding: 18px;
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--fg-muted);
        background: var(--surface-2);
        border: 1px dashed var(--border-subtle);
        border-radius: var(--r-md);
      }
      .watchlist-tool .wl-tile {
        background: var(--surface-2);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-md);
        padding: 12px 13px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        transition: border-color var(--motion-fast) var(--ease);
      }
      .watchlist-tool .wl-tile:hover { border-color: var(--accent); }
      .watchlist-tool .wl-tile-head {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
      }
      .watchlist-tool .wl-tile-avatar { width: 28px; height: 28px; display: grid; place-items: center; }
      .watchlist-tool .wl-tile-avatar-fallback {
        width: 28px; height: 28px;
        display: grid; place-items: center;
        background: var(--surface-3);
        color: var(--fg-faint);
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        border-radius: var(--r-xs);
      }
      .watchlist-tool .wl-tile-id { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
      .watchlist-tool .wl-tile-name {
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--fg-bright);
        text-decoration: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .watchlist-tool .wl-tile-name:hover { color: var(--accent); }
      .watchlist-tool .wl-tile-name .muted { color: var(--fg-muted); }
      .watchlist-tool .wl-tile-lang {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-faint);
      }
      .watchlist-tool .wl-tile-desc {
        margin: 0;
        font-size: 11.5px;
        color: var(--fg-muted);
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .watchlist-tool .wl-tile-stats {
        margin: 0;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 1px;
        background: var(--border-subtle);
        border-radius: var(--r-xs);
        overflow: hidden;
      }
      .watchlist-tool .wl-tile-stats > div {
        background: var(--surface);
        padding: 8px 9px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .watchlist-tool .wl-tile-stats dt {
        font-family: var(--font-mono);
        font-size: 9px;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: var(--fg-faint);
        margin: 0;
      }
      .watchlist-tool .wl-tile-stats dd {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
        margin: 0;
      }
      .watchlist-tool .wl-tile-stats dd.up { color: var(--up); }
      .watchlist-tool .wl-tile-stats dd.muted { color: var(--fg-muted); }

      /* Pin button (suggestions tile) ---------------------------------- */
      .watchlist-tool .wl-pin {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 10px;
        background: transparent;
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-xs);
        color: var(--fg-faint);
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        cursor: pointer;
        transition: all var(--motion-fast) var(--ease);
      }
      .watchlist-tool .wl-pin:hover { color: var(--fg-bright); border-color: var(--border); }
      .watchlist-tool .wl-pin.on {
        background: var(--accent);
        color: var(--bg);
        border-color: var(--accent);
      }
      .watchlist-tool .wl-pin-icon {
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        display: inline-flex;
        align-items: center;
      }

      /* Sync note ------------------------------------------------------- */
      .watchlist-tool .wl-sync-note {
        margin: 18px 0 0;
        text-align: center;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--fg-faint);
      }
      .watchlist-tool .wl-sync-link {
        color: var(--accent);
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .watchlist-tool .wl-sync-link:hover { opacity: 0.85; }

      @media (max-width: 1100px) {
        .watchlist-tool .wl-suggestions-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 720px) {
        .watchlist-tool .wl-suggestions-grid { grid-template-columns: 1fr; }
        .watchlist-tool .wl-hero-right { grid-template-columns: 1fr; width: 100%; }
      }
    `}</style>
  );
}
