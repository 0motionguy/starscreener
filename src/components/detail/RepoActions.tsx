"use client";

import { useState, useCallback } from "react";
import { Eye, EyeOff, GitCompareArrows, Share2 } from "lucide-react";
import { useWatchlistStore } from "@/lib/store";
import { useCompareStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Repo } from "@/lib/types";
import {
  toastCompareAdded,
  toastCompareFull,
  toastCompareRemoved,
  toastShareCopied,
  toastShareError,
  toastShareSuccess,
  toastWatchAdded,
  toastWatchRemoved,
} from "@/lib/toast";

interface RepoActionsProps {
  repo: Repo;
}

export function RepoActions({ repo }: RepoActionsProps) {
  const [copied, setCopied] = useState(false);

  const isWatched = useWatchlistStore((s) => s.isWatched(repo.id));
  const toggleWatch = useWatchlistStore((s) => s.toggleWatch);

  const isComparing = useCompareStore((s) => s.isComparing(repo.id));
  const isFull = useCompareStore((s) => s.isFull());
  const addCompare = useCompareStore((s) => s.addRepo);
  const removeCompare = useCompareStore((s) => s.removeRepo);

  const handleWatch = useCallback(() => {
    const wasWatched = isWatched;
    toggleWatch(repo.id, repo.stars);
    if (wasWatched) {
      toastWatchRemoved(repo.fullName);
    } else {
      toastWatchAdded(repo.fullName);
    }
  }, [isWatched, toggleWatch, repo.id, repo.stars, repo.fullName]);

  const handleCompare = useCallback(() => {
    if (isComparing) {
      removeCompare(repo.id);
      // Read fresh count after removal.
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

  const handleShare = useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const shareData = {
      title: repo.fullName,
      text: repo.description,
      url,
    };

    // Prefer native share if available.
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & {
          share: (data: ShareData) => Promise<void>;
        }).share(shareData);
        toastShareSuccess();
        return;
      } catch (err) {
        // User cancelled share UI — swallow silently.
        if ((err as DOMException | undefined)?.name === "AbortError") return;
        // Fall through to clipboard fallback.
      }
    }

    // Clipboard fallback.
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error("Clipboard API unavailable");
      }
      setCopied(true);
      toastShareCopied();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toastShareError();
    }
  }, [repo.fullName, repo.description]);

  const compareDisabled = !isComparing && isFull;

  return (
    <div className="flex items-center gap-2 animate-fade-in">
      {/* Watch/Unwatch */}
      <button
        onClick={handleWatch}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-button border text-sm font-medium transition-all min-h-[44px]",
          isWatched
            ? "bg-accent-green/10 border-accent-green text-accent-green"
            : "bg-bg-card border-border-primary text-text-secondary hover:bg-bg-card-hover"
        )}
      >
        {isWatched ? <EyeOff size={16} /> : <Eye size={16} />}
        {isWatched ? "Unwatch" : "Watch"}
      </button>

      {/* Compare */}
      <button
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
          "flex items-center gap-2 px-4 py-2 rounded-button border text-sm font-medium transition-all min-h-[44px]",
          isComparing
            ? "bg-accent-blue/10 border-accent-blue text-accent-blue"
            : compareDisabled
              ? "bg-bg-card border-border-primary text-text-muted cursor-not-allowed opacity-50"
              : "bg-bg-card border-border-primary text-text-secondary hover:bg-bg-card-hover"
        )}
      >
        <GitCompareArrows size={16} />
        {isComparing ? "Comparing" : "Compare"}
      </button>

      {/* Share */}
      <button
        onClick={handleShare}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-button border text-sm font-medium transition-all min-h-[44px]",
          copied
            ? "bg-accent-green/10 border-accent-green text-accent-green"
            : "bg-bg-card border-border-primary text-text-secondary hover:bg-bg-card-hover"
        )}
      >
        <Share2 size={16} />
        {copied ? "Copied!" : "Share"}
      </button>
    </div>
  );
}
