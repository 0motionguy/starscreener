"use client";

// Action row — Watch toggle, Compare add, external GitHub link.
//
// Reuses the watchlist + compare zustand stores (same source of truth as
// the rest of the app). Toast feedback mirrors the original RepoActions
// behavior so existing muscle memory keeps working.
//
// Buttons are 44px+ tall to satisfy mobile touch-target minimums.

import { useCallback } from "react";
import { Eye, EyeOff, GitCompareArrows, ExternalLink } from "lucide-react";
import type { Repo } from "@/lib/types";
import { useWatchlistStore, useCompareStore } from "@/lib/store";
import {
  toastCompareAdded,
  toastCompareFull,
  toastCompareRemoved,
  toastWatchAdded,
  toastWatchRemoved,
} from "@/lib/toast";
import { cn } from "@/lib/utils";

interface RepoActionRowProps {
  repo: Repo;
}

export function RepoActionRow({ repo }: RepoActionRowProps) {
  const isWatched = useWatchlistStore((s) => s.isWatched(repo.id));
  const toggleWatch = useWatchlistStore((s) => s.toggleWatch);

  const isComparing = useCompareStore((s) => s.isComparing(repo.id));
  const isFull = useCompareStore((s) => s.isFull());
  const addCompare = useCompareStore((s) => s.addRepo);
  const removeCompare = useCompareStore((s) => s.removeRepo);

  const handleWatch = useCallback(() => {
    const wasWatched = isWatched;
    toggleWatch(repo.id, repo.stars);
    if (wasWatched) toastWatchRemoved(repo.fullName);
    else toastWatchAdded(repo.fullName);
  }, [isWatched, toggleWatch, repo.id, repo.stars, repo.fullName]);

  const handleCompare = useCallback(() => {
    if (isComparing) {
      removeCompare(repo.id);
      const count = useCompareStore.getState().repos.length;
      toastCompareRemoved(count);
      return;
    }
    if (useCompareStore.getState().isFull()) {
      toastCompareFull();
      return;
    }
    addCompare(repo.id);
    const count = useCompareStore.getState().repos.length;
    toastCompareAdded(count);
  }, [isComparing, addCompare, removeCompare, repo.id]);

  const compareDisabled = !isComparing && isFull;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleWatch}
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-button border text-sm font-medium font-mono transition-colors min-h-[44px]",
          isWatched
            ? "bg-accent-green/10 border-accent-green text-accent-green"
            : "bg-bg-card border-border-primary text-text-secondary hover:bg-bg-card-hover",
        )}
        aria-pressed={isWatched}
      >
        {isWatched ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        {isWatched ? "Watching" : "Watch"}
      </button>

      <button
        type="button"
        onClick={handleCompare}
        disabled={compareDisabled}
        title={
          compareDisabled
            ? "Compare is full — remove one first"
            : isComparing
              ? "Remove from compare"
              : "Add to compare"
        }
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-button border text-sm font-medium font-mono transition-colors min-h-[44px]",
          isComparing
            ? "bg-accent-blue/10 border-accent-blue text-accent-blue"
            : compareDisabled
              ? "bg-bg-card border-border-primary text-text-muted cursor-not-allowed opacity-50"
              : "bg-bg-card border-border-primary text-text-secondary hover:bg-bg-card-hover",
        )}
        aria-pressed={isComparing}
      >
        <GitCompareArrows size={16} aria-hidden />
        {isComparing ? "In compare" : "Compare"}
      </button>

      <a
        href={repo.url || `https://github.com/${repo.fullName}`}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-button border border-border-primary bg-bg-card text-text-secondary hover:bg-bg-card-hover hover:text-text-primary text-sm font-medium font-mono transition-colors min-h-[44px]"
      >
        <ExternalLink size={16} aria-hidden />
        Open on GitHub
      </a>
    </div>
  );
}

export default RepoActionRow;
