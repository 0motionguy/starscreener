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
          "v2-btn min-h-[44px]",
          isWatched ? "v2-btn-primary" : "v2-btn-ghost",
        )}
        aria-pressed={isWatched}
      >
        {isWatched ? (
          <EyeOff size={14} aria-hidden style={{ marginRight: 8 }} />
        ) : (
          <Eye size={14} aria-hidden style={{ marginRight: 8 }} />
        )}
        {isWatched ? "WATCHING" : "WATCH"}
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
          "v2-btn min-h-[44px]",
          isComparing
            ? "v2-btn-primary"
            : "v2-btn-ghost",
          compareDisabled && "cursor-not-allowed opacity-50",
        )}
        aria-pressed={isComparing}
      >
        <GitCompareArrows size={14} aria-hidden style={{ marginRight: 8 }} />
        {isComparing ? "IN COMPARE" : "COMPARE"}
      </button>

      <a
        href={repo.url || `https://github.com/${repo.fullName}`}
        target="_blank"
        rel="noopener noreferrer"
        className="v2-btn v2-btn-ghost ml-auto min-h-[44px]"
      >
        <ExternalLink size={14} aria-hidden style={{ marginRight: 8 }} />
        OPEN ON GITHUB
        <span aria-hidden style={{ marginLeft: 8 }}>→</span>
      </a>
    </div>
  );
}

export default RepoActionRow;
