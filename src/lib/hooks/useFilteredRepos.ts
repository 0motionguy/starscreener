"use client";

// StarScreener — `useFilteredRepos` hook
//
// Applies the full sidebar + meta filter pipeline to a source repo list.
// Reads state from `useFilterStore` + `useWatchlistStore` via selectors so
// the hook only re-runs when a relevant slice changes.

import { useMemo } from "react";

import { applyMetaFilter, repoInStarsRange } from "../filters";
import { useFilterStore, useWatchlistStore } from "../store";
import type { Repo } from "../types";

export function useFilteredRepos(source: Repo[]): Repo[] {
  const category = useFilterStore((s) => s.category);
  const languages = useFilterStore((s) => s.languages);
  const starsRange = useFilterStore((s) => s.starsRange);
  const minMomentum = useFilterStore((s) => s.minMomentum);
  const onlyWatched = useFilterStore((s) => s.onlyWatched);
  const excludeArchived = useFilterStore((s) => s.excludeArchived);
  const activeMetaFilter = useFilterStore((s) => s.activeMetaFilter);
  const activeTag = useFilterStore((s) => s.activeTag);
  // Read the raw repos array — NEVER call .map/.filter inside the selector
  // (returning a new array every call triggers an infinite re-render loop
  // with useSyncExternalStore). Map inside useMemo instead.
  const watchedItems = useWatchlistStore((s) => s.repos);

  return useMemo(() => {
    let out = source;

    if (category) {
      out = out.filter((r) => r.categoryId === category);
    }

    if (languages.length > 0) {
      out = out.filter(
        (r) => r.language !== null && languages.includes(r.language),
      );
    }

    out = out.filter((r) => repoInStarsRange(r, starsRange));

    if (minMomentum > 0) {
      out = out.filter((r) => r.momentumScore >= minMomentum);
    }

    if (onlyWatched) {
      const set = new Set(watchedItems.map((w) => w.repoId));
      out = out.filter((r) => set.has(r.id));
    }

    if (activeMetaFilter) {
      out = applyMetaFilter(out, activeMetaFilter);
    }

    if (activeTag) {
      out = out.filter(
        (r) => Array.isArray(r.tags) && r.tags.includes(activeTag),
      );
    }

    if (excludeArchived) {
      out = out.filter((r) => r.archived !== true && r.deleted !== true);
    }

    return out;
  }, [
    source,
    category,
    languages,
    starsRange,
    minMomentum,
    onlyWatched,
    excludeArchived,
    activeMetaFilter,
    activeTag,
    watchedItems,
  ]);
}
