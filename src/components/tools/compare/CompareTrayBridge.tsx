"use client";

// CompareTrayBridge — keeps the URL (`?repos=`) and the persisted
// `useCompareStore` Zustand slice mirrored while a user is on /tools/compare.
//
// Behavior:
//  - On mount, if the URL passes repos, the store is reset to mirror that
//    selection. The URL is the canonical state on the compare surface.
//  - When the store changes (e.g. user clicks "Compare" on another tab),
//    we don't auto-navigate — we just keep the store synced to URL so the
//    "in matrix" pip on RepoCompareButton reflects reality.
//
// This bridge is render-free; it returns null.

import { useEffect } from "react";

import { useCompareStore } from "@/lib/store";

interface Props {
  selectedFullNames: string[];
  selectedIds: string[];
}

export function CompareTrayBridge({ selectedFullNames, selectedIds }: Props) {
  const setRepos = useCompareStore((s) => s.setRepos);

  useEffect(() => {
    // The Zustand slice keys by id; we supply parallel fullName overrides
    // so the "Compare" pip on repo cards stays accurate without needing
    // an extra round-trip.
    setRepos(selectedIds, selectedFullNames);
    // We deliberately only re-run when the URL-derived selection changes
    // (joined string is a stable scalar) — the store should not echo its
    // own writes back into this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.join("|"), selectedFullNames.join("|")]);

  return null;
}
