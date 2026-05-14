"use client";

import { useEffect, useMemo, useState } from "react";
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
  const storeFullNamesById = useCompareStore((s) => s.fullNamesById);
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

  const fullNameOverridesById = useMemo(
    () => ({ ...storeFullNamesById, ...urlOverridesById }),
    [storeFullNamesById, urlOverridesById],
  );

  const selectedRepos = useMemo(
    () =>
      resolveCompareFullNames(repoIds, repos, fullNameOverridesById).slice(
        0,
        COMPARE_MAX_SLOTS,
      ),
    [repoIds, repos, fullNameOverridesById],
  );

  return {
    ...urlState,
    repos: selectedRepos.length > 0 ? selectedRepos : urlState.repos,
  };
}

export function CompareSelectedCount() {
  const [mounted, setMounted] = useState(false);
  const repoIds = useCompareStore((s) => s.repos);
  const urlState = useUrlShareState();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <>0</>;

  return <>{repoIds.length > 0 ? repoIds.length : urlState.repos.length}</>;
}

export function CompareShareBarClient() {
  const [mounted, setMounted] = useState(false);
  const state = useSelectedShareState();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  if (state.repos.length < 2) return null;
  return <ShareBar state={state} />;
}
