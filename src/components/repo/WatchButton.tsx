"use client";

// WatchButton — wires .watch-btn to the persisted Zustand watchlist slice.
// shell.js has no opinions about active state for this element; React owns
// the .on class flip from the client store.

import { useEffect, useState } from "react";

import { useWatchlistStore } from "@/lib/store";

interface WatchButtonProps {
  repoId: string;
  fullName: string;
  stars: number;
  /** Optional baseline watcher count surfaced from server (e.g., aggregate). */
  baselineWatchers?: number | null;
}

export function WatchButton({
  repoId,
  fullName,
  stars,
  baselineWatchers,
}: WatchButtonProps) {
  // Avoid hydration mismatch — only read the store after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const watched = useWatchlistStore((s) =>
    mounted ? s.isWatched(repoId) : false,
  );
  const toggle = useWatchlistStore((s) => s.toggleWatch);

  const onClick = () => toggle(repoId, stars, fullName);
  const label = watched ? "Watching" : "Watch";

  return (
    <button
      type="button"
      className={`watch-btn${watched ? " on" : ""}`}
      data-watch-toggle
      aria-pressed={watched}
      onClick={onClick}
    >
      <svg className="heart" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 14s-5-3.5-5-7.5C3 4 4.5 3 6 3c1 0 2 .5 2 1.5C8 3.5 9 3 10 3c1.5 0 3 1 3 3.5C13 10.5 8 14 8 14z" />
      </svg>
      {label}
      {typeof baselineWatchers === "number" && baselineWatchers > 0 ? (
        <span
          style={{
            marginLeft: 4,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            opacity: 0.75,
          }}
        >
          · {baselineWatchers.toLocaleString()}
        </span>
      ) : null}
    </button>
  );
}
