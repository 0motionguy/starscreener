// LiveAgoTicker — client-side "Xs / Xm ago" counter.
//
// Server components can't tick — they bake their string at render time. This
// tiny client island re-computes the relative-time label every second so the
// user sees an actually-running clock next to the live pill, even though the
// underlying data only refreshes when ISR revalidates.
//
// Pure UI — no fetches, no mutations. Server passes the `fetchedAt` ISO
// timestamp; the component renders the relative label and updates locally.

"use client";

import { useEffect, useState } from "react";

interface LiveAgoTickerProps {
  /** ISO timestamp of the last successful upstream fetch. */
  fetchedAt: string | null | undefined;
  /** Show "now" instead of "0s ago" for <2s deltas. Default true. */
  swapZeroToNow?: boolean;
}

function format(deltaMs: number, swapZeroToNow: boolean): string {
  if (deltaMs < 2_000 && swapZeroToNow) return "now";
  const seconds = Math.max(0, Math.floor(deltaMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function LiveAgoTicker({ fetchedAt, swapZeroToNow = true }: LiveAgoTickerProps) {
  const fetchedMs = fetchedAt ? Date.parse(fetchedAt) : NaN;
  const initial = Number.isFinite(fetchedMs)
    ? format(Date.now() - fetchedMs, swapZeroToNow)
    : "—";
  const [label, setLabel] = useState(initial);

  useEffect(() => {
    if (!Number.isFinite(fetchedMs)) {
      setLabel("—");
      return;
    }
    // Update immediately on mount (avoids 1s lag after hydration).
    setLabel(format(Date.now() - fetchedMs, swapZeroToNow));
    const id = window.setInterval(() => {
      setLabel(format(Date.now() - fetchedMs, swapZeroToNow));
    }, 1000);
    return () => window.clearInterval(id);
  }, [fetchedMs, swapZeroToNow]);

  return <span suppressHydrationWarning>{label}</span>;
}
