"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, Star, Trash2, ArrowRight } from "lucide-react";
import { useWatchlistStore } from "@/lib/store";
import { cn, formatNumber, getRelativeTime } from "@/lib/utils";
import { Sparkline } from "@/components/shared/Sparkline";
import { DeltaBadge } from "@/components/shared/DeltaBadge";
import { MomentumBadge } from "@/components/shared/MomentumBadge";
import type { Repo, WatchlistItem } from "@/lib/types";

// ---------------------------------------------------------------------------
// Single watched-repo card
// ---------------------------------------------------------------------------

function WatchedRepoCard({
  item,
  repo,
  index,
}: {
  item: WatchlistItem;
  repo: Repo;
  index: number;
}) {
  const removeRepo = useWatchlistStore((s) => s.removeRepo);

  const starsGained = repo.stars - item.starsAtAdd;
  const delta7dPct =
    repo.stars > 0 ? (repo.starsDelta7d / repo.stars) * 100 : 0;

  return (
    <div
      className={cn(
        "bg-bg-card border border-border-primary rounded-[var(--radius-card)] p-4",
        "hover:bg-bg-card-hover hover:border-accent-green/30",
        "transition-all duration-200",
        "animate-[slide-up_0.35s_ease-out_forwards] opacity-0",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: repo info */}
        <div className="flex-1 min-w-0">
          <Link
            href={`/repo/${repo.owner}/${repo.name}`}
            className="text-text-primary font-semibold hover:text-accent-green transition-colors truncate block"
          >
            {repo.fullName}
          </Link>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-sm text-text-secondary">
              <Star size={13} className="text-accent-amber shrink-0" />
              <span className="font-mono text-text-primary">
                {formatNumber(repo.stars)}
              </span>
            </span>

            <DeltaBadge value={delta7dPct} size="sm" showBackground />

            <Sparkline
              data={repo.sparklineData}
              width={72}
              height={20}
              positive={repo.starsDelta7d >= 0}
            />

            <MomentumBadge score={repo.momentumScore} size="sm" />
          </div>

          {/* Since-added + added-date */}
          <div className="flex items-center gap-3 mt-2 text-xs text-text-tertiary">
            <span className="font-mono">
              {starsGained >= 0 ? "+" : ""}
              {formatNumber(starsGained)} since added
            </span>
            <span>Added {getRelativeTime(item.addedAt)}</span>
          </div>
        </div>

        {/* Right: remove button */}
        <button
          type="button"
          onClick={() => removeRepo(item.repoId)}
          className={cn(
            "shrink-0 p-2 rounded-[var(--radius-button)]",
            "text-text-tertiary hover:text-accent-red hover:bg-accent-red/10",
            "transition-colors duration-150 cursor-pointer",
          )}
          aria-label={`Remove ${repo.fullName} from watchlist`}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyWatchlist() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-[fade-in_0.4s_ease-out]">
      <Eye size={48} className="text-text-tertiary mb-4" strokeWidth={1.5} />
      <h3 className="text-lg font-semibold text-text-primary mb-1">
        No repos watched yet
      </h3>
      <p className="text-sm text-text-secondary mb-6 max-w-xs">
        Start by adding repos from the trending page
      </p>
      <Link
        href="/"
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-button)]",
          "bg-accent-green/10 text-accent-green font-medium text-sm",
          "hover:bg-accent-green/20 transition-colors duration-150",
        )}
      >
        Browse trending repos
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WatchlistManager() {
  const watchlist = useWatchlistStore((s) => s.repos);
  const [reposById, setReposById] = useState<Record<string, Repo>>({});
  const [loading, setLoading] = useState(false);

  // Hydrate repos via the live /api/repos?ids=a,b,c endpoint whenever the
  // watchlist ID list changes. We keep the results keyed by id so removing
  // and re-adding a repo doesn't force a second round-trip.
  useEffect(() => {
    if (watchlist.length === 0) {
      setReposById({});
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const ids = watchlist.map((w) => w.repoId).join(",");
        const res = await fetch(
          `/api/repos?ids=${encodeURIComponent(ids)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { repos?: Repo[] };
        const next: Record<string, Repo> = {};
        for (const r of Array.isArray(data.repos) ? data.repos : []) {
          next[r.id] = r;
        }
        setReposById(next);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        console.error("[watchlist:manager] fetch failed", err);
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [watchlist]);

  if (watchlist.length === 0) {
    return <EmptyWatchlist />;
  }

  // Pair each watchlist item with its resolved Repo; drop items we
  // couldn't hydrate (e.g. the repo was removed from the store).
  const watchedRepos = watchlist
    .map((item) => {
      const repo = reposById[item.repoId];
      return repo ? { item, repo } : null;
    })
    .filter(Boolean) as { item: WatchlistItem; repo: Repo }[];

  if (watchedRepos.length === 0) {
    // If still loading, show a subtle skeleton. Otherwise the live API
    // returned nothing for the selected ids — render the empty state.
    if (loading) {
      return (
        <div className="flex flex-col gap-3">
          {watchlist.slice(0, 3).map((item) => (
            <div
              key={item.repoId}
              className="h-24 bg-bg-card border border-border-primary rounded-[var(--radius-card)] animate-pulse"
            />
          ))}
        </div>
      );
    }
    return <EmptyWatchlist />;
  }

  return (
    <div className="flex flex-col gap-3">
      {watchedRepos.map(({ item, repo }, i) => (
        <WatchedRepoCard key={item.repoId} item={item} repo={repo} index={i} />
      ))}
    </div>
  );
}
