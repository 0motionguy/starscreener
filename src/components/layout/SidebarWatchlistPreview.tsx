"use client";

/**
 * SidebarWatchlistPreview — top 5 watched repos rendered in a dense
 * sparkline / name / momentum layout. Empty state prompts the user to
 * start watching a repo.
 *
 * Parent resolves the top 5 from the watchlist store + repo data before
 * passing them in — this component is a pure presentation layer.
 */
import Link from "next/link";
import { EyeOff } from "lucide-react";
import { Sparkline } from "@/components/shared/Sparkline";

export interface SidebarWatchlistPreviewRepo {
  id: string;
  fullName: string;
  momentumScore: number;
  sparklineData: number[];
  starsDelta24h: number;
}

export interface SidebarWatchlistPreviewProps {
  repos: SidebarWatchlistPreviewRepo[];
}

export function SidebarWatchlistPreview({
  repos,
}: SidebarWatchlistPreviewProps) {
  if (repos.length === 0) {
    return (
      <div className="flex flex-col items-center text-center px-3 py-6 gap-2">
        <EyeOff className="w-4 h-4 text-text-muted" strokeWidth={1.75} />
        <span className="text-[12px] font-medium text-text-secondary">
          No watched repos
        </span>
        <span className="text-[11px] text-text-muted leading-snug">
          Click the eye icon on any repo to start watching.
        </span>
      </div>
    );
  }

  const top = repos.slice(0, 5);

  return (
    <div className="flex flex-col">
      {top.map((repo) => (
        <Link
          key={repo.id}
          href={`/repo/${repo.id}`}
          className="grid grid-cols-[40px_1fr_auto] gap-2 items-center px-3 h-10 hover:bg-bg-card-hover transition-colors"
        >
          <Sparkline
            data={repo.sparklineData}
            width={40}
            height={12}
            positive={repo.starsDelta24h >= 0}
          />
          <span className="text-[12px] text-text-secondary truncate">
            {repo.fullName}
          </span>
          <span className="text-[10px] font-mono tabular-nums px-1 rounded bg-bg-tertiary text-functional">
            {repo.momentumScore}
          </span>
        </Link>
      ))}
      <Link
        href="/watchlist"
        className="px-3 h-8 flex items-center font-mono text-[10px] uppercase tracking-wider text-text-tertiary hover:text-functional transition-colors"
      >
        View all →
      </Link>
    </div>
  );
}
