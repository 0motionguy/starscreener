"use client";

/**
 * SidebarWatchlistPreview — top 5 watched repos rendered as avatar +
 * name + 24h delta. Empty state prompts the user to start watching.
 *
 * Parent resolves the top 5 from the watchlist store + repo data before
 * passing them in — this component is a pure presentation layer.
 */
import Link from "next/link";
import { EyeOff } from "lucide-react";
import type { MovementStatus } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";
import { ChannelDots } from "@/components/cross-signal/ChannelDots";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoDisplayLogoUrl } from "@/lib/logos";

// Per-source badges (HnBadge / BskyBadge / PhBadge / DevtoBadge) intentionally
// removed from this preview: their lib imports drag ioredis (a Node-only
// dep) into the client bundle via the data-store, breaking the dev build.
// `ChannelDots` already conveys per-source signal in a single 28px dot row.

export interface SidebarWatchlistPreviewRepo {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  ownerAvatarUrl: string;
  momentumScore: number;
  movementStatus?: MovementStatus;
  sparklineData: number[];
  stars: number;
  starsDelta24h: number;
  starsDelta24hMissing?: boolean;
  /** Precomputed per-channel firing state for ChannelDots. Absent on
   * legacy callers; ChannelDots renders all-off (or null with hideWhenEmpty). */
  channelStatus?: {
    github: boolean;
    reddit: boolean;
    hn: boolean;
    bluesky: boolean;
    devto: boolean;
    twitter: boolean;
  };
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
          Click the bookmark icon on any repo to start watching.
        </span>
      </div>
    );
  }

  const top = repos.slice(0, 5);

  return (
    <div className="flex flex-col">
      {top.map((repo) => {
        const delta = repo.starsDelta24h;
        const missing = repo.starsDelta24hMissing === true;
        const deltaClass =
          missing
            ? "text-text-muted"
            : delta > 0
              ? "text-up"
              : delta < 0
                ? "text-down"
                : "text-text-tertiary";
        const deltaLabel = missing
          ? "—"
          : delta > 0
            ? `+${formatNumber(delta)}`
            : delta < 0
              ? formatNumber(delta)
              : "0";
        return (
          <Link
            key={repo.id}
            href={`/repo/${repo.owner}/${repo.name}`}
            className="grid grid-cols-[20px_1fr_auto] gap-2 items-center px-3 h-10 hover:bg-bg-card-hover transition-colors"
            title={`${repo.fullName} — ${deltaLabel} stars / 24h`}
          >
            <EntityLogo
              src={repoDisplayLogoUrl(repo.fullName, repo.ownerAvatarUrl, 20)}
              name={repo.fullName}
              size={20}
              shape="circle"
              alt=""
            />
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[12px] text-text-secondary truncate">
                {repo.fullName}
              </span>
              <ChannelDots
                status={repo.channelStatus ?? null}
                hideWhenEmpty
                size="sm"
              />
            </div>
            <span
              className={cn(
                "text-[10px] font-mono tabular-nums whitespace-nowrap",
                deltaClass,
              )}
            >
              {deltaLabel}
            </span>
          </Link>
        );
      })}
      <Link
        href="/watchlist"
        className="px-3 h-8 flex items-center font-mono text-[10px] uppercase tracking-wider text-text-tertiary hover:text-functional transition-colors"
      >
        View all →
      </Link>
    </div>
  );
}
