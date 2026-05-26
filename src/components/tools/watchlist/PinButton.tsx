"use client";

// PinButton — tiny client island used by the server-rendered suggestions
// grid. Wraps the Zustand watchlist store so the server tile body can stay
// server-rendered while the toggle stays interactive.

import { useEffect, useState } from "react";

import { Icon } from "@/lib/icons";
import { useWatchlistStore } from "@/lib/store";

interface PinButtonProps {
  repoId: string;
  fullName: string;
  stars: number;
}

export function PinButton({ repoId, fullName, stars }: PinButtonProps) {
  // Avoid hydration mismatch — only read the persisted store after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const watched = useWatchlistStore((s) =>
    mounted ? s.isWatched(repoId) : false,
  );
  const toggle = useWatchlistStore((s) => s.toggleWatch);

  const onClick = () => toggle(repoId, stars, fullName);
  const label = watched ? "Pinned" : "Pin";

  return (
    <button
      type="button"
      className={`wl-pin${watched ? " on" : ""}`}
      data-pin-toggle
      aria-pressed={watched}
      onClick={onClick}
    >
      <span aria-hidden="true" className="wl-pin-icon">
        {watched ? <Icon name="check-circle" size="sm" /> : "+"}
      </span>
      {label}
    </button>
  );
}
