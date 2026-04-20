"use client";

// StarScreener — `useSortedRepos` hook
//
// Thin wrapper that applies the active column sort from `useFilterStore`
// on top of an already-filtered repo list. Pure memo — runs only when the
// input list, column, or direction changes.

import { useMemo } from "react";

import { sortReposForTerminal } from "../filters";
import { useFilterStore } from "../store";
import type { Repo } from "../types";

export function useSortedRepos(repos: Repo[]): Repo[] {
  const sortColumn = useFilterStore((s) => s.sortColumn);
  const sortDirection = useFilterStore((s) => s.sortDirection);
  const activeTab = useFilterStore((s) => s.activeTab);
  const timeRange = useFilterStore((s) => s.timeRange);

  return useMemo(
    () =>
      sortReposForTerminal(repos, {
        sortColumn,
        sortDirection,
        activeTab,
        timeRange,
      }),
    [repos, sortColumn, sortDirection, activeTab, timeRange],
  );
}
