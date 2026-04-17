"use client";

// StarScreener — Terminal body row
//
// Memoized `<tr>` that wires click-through navigation (including
// middle-click / ctrl-click new-tab), hover/focus state, hot/breakout
// halos, and plumbs watch/compare state into the row context consumed
// by the action cell.

import { memo, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";

import type { Density, Repo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCompareStore, useWatchlistStore } from "@/lib/store";
import {
  toastCompareAdded,
  toastCompareFull,
  toastCompareRemoved,
  toastWatchAdded,
  toastWatchRemoved,
} from "@/lib/toast";

import type { Column, RowContext } from "./columns";
import { TerminalCell } from "./TerminalCell";

interface TerminalRowProps {
  repo: Repo;
  displayRank: number;
  visibleColumns: Column[];
  density: Density;
  focused: boolean;
  /** Staggered entry index — capped at 6 (max 300ms total). */
  index?: number;
}

function TerminalRowBase({
  repo,
  displayRank,
  visibleColumns,
  density,
  focused,
  index = 0,
}: TerminalRowProps) {
  const router = useRouter();

  const isWatched = useWatchlistStore((s) => s.repos.some((r) => r.repoId === repo.id));
  const toggleWatch = useWatchlistStore((s) => s.toggleWatch);

  const isComparing = useCompareStore((s) => s.repos.includes(repo.id));
  const compareCount = useCompareStore((s) => s.repos.length);
  const addCompare = useCompareStore((s) => s.addRepo);
  const removeCompare = useCompareStore((s) => s.removeRepo);

  const compareDisabled = !isComparing && compareCount >= 4;

  const href = `/repo/${repo.owner}/${repo.name}`;

  const onToggleWatch = useCallback(() => {
    const wasWatched = isWatched;
    toggleWatch(repo.id, repo.stars);
    if (wasWatched) toastWatchRemoved(repo.fullName);
    else toastWatchAdded(repo.fullName);
  }, [isWatched, toggleWatch, repo.id, repo.stars, repo.fullName]);

  const onToggleCompare = useCallback(() => {
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
  }, [isComparing, removeCompare, addCompare, repo.id]);

  const rowContext: RowContext = useMemo(
    () => ({
      rank: displayRank,
      density,
      isWatched,
      isComparing,
      compareDisabled,
      onToggleWatch,
      onToggleCompare,
    }),
    [
      displayRank,
      density,
      isWatched,
      isComparing,
      compareDisabled,
      onToggleWatch,
      onToggleCompare,
    ],
  );

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLTableRowElement>) => {
      // Respect new-tab intent: middle-click or ctrl/meta-click.
      if (e.button === 1 || e.ctrlKey || e.metaKey) {
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      if (e.button !== 0) return;
      router.push(href);
    },
    [href, router],
  );

  const onAuxClick = useCallback(
    (e: React.MouseEvent<HTMLTableRowElement>) => {
      if (e.button === 1) {
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }
    },
    [href],
  );

  const isHot = repo.movementStatus === "hot";
  const isBreakout = repo.movementStatus === "breakout";
  const rowH = density === "compact" ? 44 : 56;

  // Stagger cap — 6 rows * 50ms = 300ms max.
  const stagger = Math.min(index, 6) * 50;

  return (
    <tr
      role="row"
      aria-rowindex={displayRank}
      onClick={onClick}
      onAuxClick={onAuxClick}
      style={{
        height: rowH,
        animationDelay: stagger > 0 ? `${stagger}ms` : undefined,
      }}
      className={cn(
        "row-hover cursor-pointer border-b border-border-secondary bg-bg-primary",
        "animate-[slide-up_0.35s_ease-out_forwards] opacity-0",
        focused &&
          "outline outline-2 -outline-offset-2 outline-functional bg-bg-row-hover",
        (isHot || isBreakout) &&
          "shadow-[inset_0_0_0_1px_rgba(245,110,15,0.25),0_0_14px_-4px_rgba(245,110,15,0.35)]",
      )}
    >
      {visibleColumns.map((col) => (
        <TerminalCell
          key={col.id}
          column={col}
          repo={repo}
          rowContext={rowContext}
        />
      ))}
      {/* Spacer cell mirroring the header's controls cell so columns align. */}
      <td style={{ width: 80, minWidth: 80 }} aria-hidden="true" />
    </tr>
  );
}

// Shallow-compare the props we care about. The store subscribers inside
// TerminalRowBase (watchlist + compare) cause re-renders whenever the
// user interacts with watch/compare state, so we don't need to include
// store-derived values here.
export const TerminalRow = memo(TerminalRowBase);
