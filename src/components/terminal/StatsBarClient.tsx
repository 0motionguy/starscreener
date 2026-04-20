"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Flame, RefreshCcw, Zap } from "lucide-react";
import { cn, getRelativeTime } from "@/lib/utils";
import { toastRefreshError, toastRefreshSuccess } from "@/lib/toast";

// UI-shape view of the stats payload returned by /api/pipeline/status.
// Distinct from the pipeline-internal `GlobalStats` interface — hot/breakout
// can be null here when the classifier signal isn't verified yet (P2 / P3).
export interface StatsBarStats {
  totalRepos: number;
  totalStars: number;
  hotCount: number | null;
  breakoutCount: number | null;
  lastRefreshAt: string | null;
}

interface StatsBarClientProps {
  stats: StatsBarStats;
}

function Divider() {
  return (
    <div
      aria-hidden="true"
      className="w-px h-4 bg-border-primary shrink-0"
    />
  );
}

/**
 * StatsBarClient — interactive wrapper around the inline stats row.
 *
 * Re-inlines the stat text so the refresh button and the row live in one
 * flex container. On click, POSTs /api/pipeline/recompute and then calls
 * `router.refresh()` so server components (including StatsBar consumers)
 * re-read the fresh store state. Brief green check animation on success.
 */
export function StatsBarClient({ stats }: StatsBarClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [justSucceeded, setJustSucceeded] = useState(false);

  const lastRefresh = stats.lastRefreshAt
    ? getRelativeTime(stats.lastRefreshAt)
    : "—";

  async function handleRefresh() {
    if (loading) return;
    setLoading(true);
    const startedAt = performance.now();
    try {
      const res = await fetch("/api/pipeline/recompute", { method: "POST" });
      if (!res.ok) throw new Error(`recompute failed (${res.status})`);
      const durationMs = Math.round(performance.now() - startedAt);
      setJustSucceeded(true);
      toastRefreshSuccess(durationMs);
      // Re-fetch server components so the stats row picks up fresh numbers.
      router.refresh();
      setTimeout(() => setJustSucceeded(false), 1500);
    } catch (err) {
      console.error("[StatsBarClient] refresh failed", err);
      toastRefreshError();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 shrink-0 whitespace-nowrap",
        "font-mono text-xs tabular-nums",
      )}
    >
      <span
        className="flex items-center gap-1.5"
        title="Total unique repos in the screener universe — everything the pipeline tracks across discovery feeds and curated collections."
      >
        <span className="text-text-tertiary">Repos tracked:</span>
        <span className="text-text-primary">{stats.totalRepos}</span>
      </span>

      <Divider />

      <span
        className="flex items-center gap-1.5 text-brand"
        title="Hot = momentum score ≥ 55 AND +25 stars in the last 24 h (or curated-hot inertia). Strong short-term buzz right now."
      >
        <Flame size={12} aria-hidden="true" />
        <span className="text-text-tertiary">Hot:</span>
        <span>{stats.hotCount ?? "—"}</span>
      </span>

      <Divider />

      <span
        className="flex items-center gap-1.5"
        title="Breakout = surge detected on star + fork velocity vs. baseline. Rarer than Hot — the ones actually going parabolic."
      >
        <Zap size={12} aria-hidden="true" className="text-warning" />
        <span className="text-text-tertiary">Breakouts:</span>
        <span className="text-warning">{stats.breakoutCount ?? "—"}</span>
      </span>

      <Divider />

      <span className="flex items-center gap-1.5 text-text-tertiary">
        <span>Last refresh:</span>
        <span>{lastRefresh}</span>
      </span>

      <button
        type="button"
        onClick={handleRefresh}
        disabled={loading}
        aria-label="Refresh pipeline"
        aria-busy={loading}
        className={cn(
          "inline-flex items-center justify-center size-6 rounded-md",
          "border border-border-primary text-text-tertiary",
          "transition-colors duration-150",
          "hover:border-brand hover:text-brand",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
          justSucceeded && "border-functional text-functional",
        )}
      >
        {justSucceeded ? (
          <Check size={14} aria-hidden="true" />
        ) : (
          <RefreshCcw
            size={14}
            aria-hidden="true"
            className={cn(loading && "animate-spin")}
          />
        )}
      </button>
    </div>
  );
}
