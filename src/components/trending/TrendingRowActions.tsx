"use client";

import { useState } from "react";

declare global {
  interface Window {
    TR?: {
      showToast?: (text: string) => void;
    };
  }
}

interface TrendingRowActionsProps {
  repo: string;
}

export function TrendingRowActions({ repo }: TrendingRowActionsProps) {
  const [watched, setWatched] = useState(false);
  const [alerted, setAlerted] = useState(false);
  const [compared, setCompared] = useState(false);

  function toast(text: string) {
    window.TR?.showToast?.(text);
  }

  return (
    <div className="row-acts" aria-label={`Actions for ${repo}`}>
      <button
        type="button"
        className={`row-act${watched ? " watched" : ""}`}
        title={watched ? "Remove from watchlist" : "Add to watchlist"}
        aria-pressed={watched}
        onClick={() => {
          const next = !watched;
          setWatched(next);
          toast(next ? `${repo} added to watchlist` : `${repo} removed from watchlist`);
        }}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M8 14s-5-3.5-5-7.5C3 4 4.5 3 6 3c1 0 2 .5 2 1.5C8 3.5 9 3 10 3c1.5 0 3 1 3 3.5C13 10.5 8 14 8 14z" />
        </svg>
      </button>
      <button
        type="button"
        className={`row-act${alerted ? " watched" : ""}`}
        title={alerted ? "Alert armed" : "Set alert"}
        aria-pressed={alerted}
        onClick={() => {
          const next = !alerted;
          setAlerted(next);
          toast(next ? `Alert armed for ${repo}` : `Alert muted for ${repo}`);
        }}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M3 12V8a5 5 0 0110 0v4l1 2H2l1-2zM6 14a2 2 0 004 0" />
        </svg>
      </button>
      <button
        type="button"
        className={`row-act${compared ? " watched" : ""}`}
        title={compared ? "In compare slot" : "Add to compare"}
        aria-pressed={compared}
        onClick={() => {
          const next = !compared;
          setCompared(next);
          toast(next ? `${repo} added to compare` : `${repo} removed from compare`);
        }}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M3 8h4l1-3 2 6 1-3h2" />
        </svg>
      </button>
    </div>
  );
}
