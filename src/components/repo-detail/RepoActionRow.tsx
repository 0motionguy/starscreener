"use client";

// Action row — Watch toggle, Compare add, external GitHub link.
//
// Reuses the watchlist + compare zustand stores (same source of truth as
// the rest of the app). Toast feedback mirrors the original RepoActions
// behavior so existing muscle memory keeps working.
//
// Buttons are 44px+ tall to satisfy mobile touch-target minimums.

import { useCallback } from "react";
import type { CSSProperties } from "react";
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

interface RepoActionRowProps {
  repo: Repo;
}

const BTN_BASE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44,
  padding: "6px 12px",
  borderRadius: 2,
  border: "1px solid var(--v4-line-300)",
  background: "var(--v4-bg-050)",
  color: "var(--v4-ink-100)",
  fontFamily: "var(--font-geist-mono), monospace",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  textDecoration: "none",
  cursor: "pointer",
};

const BTN_PRIMARY: CSSProperties = {
  ...BTN_BASE,
  background: "var(--v4-acc-soft)",
  borderColor: "var(--v4-acc)",
  color: "var(--v4-acc)",
};

const BTN_DISABLED: CSSProperties = {
  cursor: "not-allowed",
  opacity: 0.5,
};

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
        style={isWatched ? BTN_PRIMARY : BTN_BASE}
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
        style={{
          ...(isComparing ? BTN_PRIMARY : BTN_BASE),
          ...(compareDisabled ? BTN_DISABLED : null),
        }}
        aria-pressed={isComparing}
      >
        <GitCompareArrows size={14} aria-hidden style={{ marginRight: 8 }} />
        {isComparing ? "IN COMPARE" : "COMPARE"}
      </button>

      <a
        href={repo.url || `https://github.com/${repo.fullName}`}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto"
        style={BTN_BASE}
      >
        <ExternalLink size={14} aria-hidden style={{ marginRight: 8 }} />
        OPEN ON GITHUB
        <span aria-hidden style={{ marginLeft: 8 }}>→</span>
      </a>
    </div>
  );
}

export default RepoActionRow;
