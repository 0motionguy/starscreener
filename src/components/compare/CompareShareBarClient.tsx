"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { ShareBar } from "@/components/share/ShareBar";
import { useCompareRepos } from "@/hooks/useCompareRepos";
import { resolveCompareFullNames } from "@/lib/compare-selection";
import { useCompareStore } from "@/lib/store";
import { decodeStarActivityUrl } from "@/lib/star-activity-url";
import { slugToId } from "@/lib/utils";
import { COMPARE_MAX_SLOTS } from "./palette";

function useUrlShareState() {
  const searchParams = useSearchParams();
  return useMemo(() => {
    return decodeStarActivityUrl(
      new URLSearchParams(searchParams?.toString() ?? ""),
    );
  }, [searchParams]);
}

function useSelectedShareState() {
  const repoIds = useCompareStore((s) => s.repos);
  const hasHydrated =
    useCompareStore.persist?.hasHydrated?.() ?? true;
  const { repos } = useCompareRepos(repoIds, hasHydrated);
  const urlState = useUrlShareState();

  const urlOverridesById = useMemo(() => {
    const pairs = urlState.repos
      .map((fullName) => [slugToId(fullName), fullName] as const)
      .filter(
        (entry): entry is readonly [string, string] =>
          Boolean(entry[0] && entry[1]),
      );
    return Object.fromEntries(pairs);
  }, [urlState.repos]);

  const selectedRepos = useMemo(
    () =>
      resolveCompareFullNames(repoIds, repos, urlOverridesById).slice(
        0,
        COMPARE_MAX_SLOTS,
      ),
    [repoIds, repos, urlOverridesById],
  );

  return {
    ...urlState,
    repos: selectedRepos.length > 0 ? selectedRepos : urlState.repos,
  };
}

export function CompareSelectedCount() {
  const repoIds = useCompareStore((s) => s.repos);
  const urlState = useUrlShareState();
  return <>{repoIds.length > 0 ? repoIds.length : urlState.repos.length}</>;
}

export function CompareShareBarClient() {
  const state = useSelectedShareState();
  if (state.repos.length < 2) return null;
  return <ShareBar state={state} />;
}
