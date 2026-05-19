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
      className="w-px h-3.5 shrink-0"
      style={{ background: "var(--v2-line-200)" }}
    />
  );
}

/**
 * StatsBarClient — interactive wrapper around the inline stats row.
 *
 * Re-inlines the stat text so the refresh button and the row live in one
 * flex container. On click, POSTs /api/pipeline/refresh (public, rate-limited
 * wrapper around recompute — /api/pipeline/recompute itself requires
 * CRON_SECRET and is not safe to call from the browser) and then calls
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
      const res = await fetch("/api/pipeline/refresh", { method: "POST" });
      if (!res.ok) throw new Error(`refresh failed (${res.status})`);
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
      className="flex items-center gap-2.5 shrink-0 whitespace-nowrap v2-mono tabular-nums"
      style={{ fontSize: 10 }}
    >
      <span
        className="flex items-center gap-1.5"
        title="Total unique repos in the screener universe — everything the pipeline tracks across discovery feeds and curated collections."
      >
        <span style={{ color: "var(--v2-ink-400)" }}>REPOS</span>
        <span style={{ color: "var(--v2-ink-100)" }}>{stats.totalRepos}</span>
      </span>

      <Divider />

      <span
        className="flex items-center gap-1.5"
        style={{ color: "var(--v2-acc)" }}
        title="Hot = momentum score ≥ 55 AND +25 stars in the last 24 h (or curated-hot inertia). Strong short-term buzz right now."
      >
        <Flame size={11} aria-hidden="true" strokeWidth={1.75} />
        <span style={{ color: "var(--v2-ink-400)" }}>HOT</span>
        <span>{stats.hotCount ?? "—"}</span>
      </span>

      <Divider />

      <span
        className="flex items-center gap-1.5"
        title="Breakout = surge detected on star + fork velocity vs. baseline. Rarer than Hot — the ones actually going parabolic."
      >
        <Zap
          size={11}
          aria-hidden="true"
          strokeWidth={1.75}
          style={{ color: "var(--v2-sig-amber)" }}
        />
        <span style={{ color: "var(--v2-ink-400)" }}>BREAKOUTS</span>
        <span style={{ color: "var(--v2-sig-amber)" }}>
          {stats.breakoutCount ?? "—"}
        </span>
      </span>

      <Divider />

      <span
        className="flex items-center gap-1.5"
        style={{ color: "var(--v2-ink-400)" }}
      >
        <span>LAST</span>
        <span style={{ color: "var(--v2-ink-200)" }}>{lastRefresh}</span>
      </span>

      <button
        type="button"
        onClick={handleRefresh}
        disabled={loading}
        aria-label="Refresh pipeline"
        aria-busy={loading}
        className={cn(
          "inline-flex items-center justify-center size-6 transition-colors duration-150",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "focus-visible:outline-none",
        )}
        style={{
          border: "1px solid",
          borderRadius: 2,
          borderColor: justSucceeded
            ? "var(--v2-sig-green)"
            : "var(--v2-line-300)",
          color: justSucceeded
            ? "var(--v2-sig-green)"
            : "var(--v2-ink-300)",
          background: justSucceeded
            ? "rgba(34, 197, 94, 0.08)"
            : "transparent",
        }}
      >
        {justSucceeded ? (
          <Check size={13} aria-hidden="true" strokeWidth={1.75} />
        ) : (
          <RefreshCcw
            size={13}
            aria-hidden="true"
            strokeWidth={1.75}
            className={cn(loading && "animate-spin")}
          />
        )}
      </button>
    </div>
  );
}
