"use client";

// UI-06: shared `/api/repos?ids=...` fetcher used by CompareClient +
// CompareProfileGrid. Both components rendered together on /compare and
// each independently fetched the same payload — 2 sequential network
// calls covering identical data. This hook dedupes via a module-level
// in-flight Map (concurrent callers with the same id set collapse to
// one fetch) plus a small 30s cache so a back-to-back render doesn't
// re-network at all.

import { useEffect, useMemo, useState } from "react";
import type { Repo } from "@/lib/types";

interface CacheEntry {
  repos: Repo[];
  fetchedAtMs: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<Repo[]>>();

function makeKey(repoIds: ReadonlyArray<string>): string {
  return repoIds.slice().sort().join(",");
}

async function fetchCompareRepos(
  repoIds: ReadonlyArray<string>,
  signal: AbortSignal,
): Promise<Repo[]> {
  const res = await fetch(
    `/api/repos?ids=${encodeURIComponent(repoIds.join(","))}`,
    { signal },
  );
  if (!res.ok) throw new Error(`status ${res.status}`);
  const data = (await res.json()) as { repos?: Repo[] };
  return Array.isArray(data.repos) ? data.repos : [];
}

export interface UseCompareReposResult {
  repos: Repo[];
  loading: boolean;
}

/**
 * Resolve `Repo[]` for a compare-store id list with cross-component
 * dedupe. Pass `hasHydrated=false` while the persist-rehydrate is
 * in flight; the hook holds an empty array until you flip it true.
 */
export function useCompareRepos(
  repoIds: ReadonlyArray<string>,
  hasHydrated: boolean,
): UseCompareReposResult {
  const key = useMemo(() => makeKey(repoIds), [repoIds]);
  const [repos, setRepos] = useState<Repo[]>(() => cache.get(key)?.repos ?? []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (repoIds.length === 0) {
      setRepos([]);
      setLoading(false);
      return;
    }

    // Fast path: cache fresh enough.
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && now - cached.fetchedAtMs < CACHE_TTL_MS) {
      setRepos(cached.repos);
      setLoading(false);
      return;
    }

    let cancelled = false;

    // De-dupe: reuse an in-flight promise if one is already running for
    // this exact id set.
    let promise = inFlight.get(key);
    let controller: AbortController | null = null;
    if (!promise) {
      controller = new AbortController();
      promise = fetchCompareRepos(repoIds, controller.signal)
        .catch((err) => {
          if ((err as { name?: string }).name === "AbortError") {
            // Caller aborted — let the hook reset; don't pollute cache.
            return [] as Repo[];
          }
          console.error("[compare] /api/repos failed", err);
          return [] as Repo[];
        })
        .then((result) => {
          cache.set(key, { repos: result, fetchedAtMs: Date.now() });
          return result;
        })
        .finally(() => {
          inFlight.delete(key);
        });
      inFlight.set(key, promise);
    }

    setLoading(true);
    promise
      .then((result) => {
        if (!cancelled) {
          setRepos(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRepos([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      // Only abort the underlying request if WE owned it AND no other
      // consumer is also waiting on the same in-flight promise.
      if (controller && inFlight.get(key) === promise) {
        controller.abort();
      }
    };
  }, [key, hasHydrated, repoIds]);

  return { repos, loading };
}

/**
 * Test helper — drop the cache + abort any in-flight requests. Not
 * exported via barrel because production has no need.
 */
export function _resetCompareReposCacheForTests(): void {
  cache.clear();
  inFlight.clear();
}
