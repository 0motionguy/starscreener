"use client";

// StarScreener — `useSortedRepos` hook
//
// Thin wrapper that applies the active column sort from `useFilterStore`
// on top of an already-filtered repo list. Pure memo — runs only when the
// input list, column, or direction changes.

import { useMemo } from "react";

import { sortReposByColumn } from "../filters";
import { useFilterStore } from "../store";
import type { Repo } from "../types";

export function useSortedRepos(repos: Repo[]): Repo[] {
  const sortColumn = useFilterStore((s) => s.sortColumn);
  const sortDirection = useFilterStore((s) => s.sortDirection);

  return useMemo(
    () => sortReposByColumn(repos, sortColumn, sortDirection),
    [repos, sortColumn, sortDirection],
  );
}
