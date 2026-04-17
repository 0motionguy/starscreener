import { Flame, Zap } from "lucide-react";
import { cn, getRelativeTime } from "@/lib/utils";
import type { GlobalStats } from "@/lib/pipeline/queries/aggregate";

interface StatsBarProps {
  stats: GlobalStats;
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
 * StatsBar — server component. Renders an inline, mono, compact row of the
 * four global pipeline stats. Pure presentation — no refresh action here
 * (that lives in StatsBarClient).
 */
export function StatsBar({ stats }: StatsBarProps) {
  const lastRefresh = stats.lastRefreshAt
    ? getRelativeTime(stats.lastRefreshAt)
    : "—";

  return (
    <div
      className={cn(
        "flex items-center gap-3",
        "font-mono text-xs tabular-nums",
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className="text-text-tertiary">Repos tracked:</span>
        <span className="text-text-primary">{stats.totalRepos}</span>
      </span>

      <Divider />

      <span className="flex items-center gap-1.5 text-brand">
        <Flame size={12} aria-hidden="true" />
        <span className="text-text-tertiary">Hot:</span>
        <span>{stats.hotCount}</span>
      </span>

      <Divider />

      <span className="flex items-center gap-1.5">
        <Zap size={12} aria-hidden="true" className="text-warning" />
        <span className="text-text-tertiary">Breakouts:</span>
        <span className="text-warning">{stats.breakoutCount}</span>
      </span>

      <Divider />

      <span className="flex items-center gap-1.5 text-text-tertiary">
        <span>Last refresh:</span>
        <span>{lastRefresh}</span>
      </span>
    </div>
  );
}
