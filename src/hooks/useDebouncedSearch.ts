"use client";

import { useEffect, useRef, useState } from "react";

export interface UseDebouncedSearchOptions {
  /** Debounce window in milliseconds. Defaults to 200ms. */
  delayMs?: number;
  /** Skip fetching entirely when false (e.g. preview disabled). Default true. */
  enabled?: boolean;
  /** Minimum trimmed query length before a fetch fires. Default 0. */
  minChars?: number;
}

export interface UseDebouncedSearchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** The trimmed query value that produced `data`. Lags `query` by debounce. */
  debouncedQuery: string;
}

/**
 * Debounce a `query` string and run `fetcher` with an AbortSignal whenever it
 * settles. The previous in-flight request is aborted on every new edit and on
 * unmount. Replaces hand-rolled debounce + AbortController patterns scattered
 * across SearchBar, CompareSelector, and similar surfaces.
 */
export function useDebouncedSearch<T>(
  query: string,
  fetcher: (q: string, signal: AbortSignal) => Promise<T>,
  opts: UseDebouncedSearchOptions = {},
): UseDebouncedSearchResult<T> {
  const { delayMs = 200, enabled = true, minChars = 0 } = opts;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  // Latest fetcher captured in a ref so callers can pass an inline arrow
  // without retriggering the effect on every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      setError(null);
      setDebouncedQuery("");
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < minChars) {
      setData(null);
      setLoading(false);
      setError(null);
      setDebouncedQuery(trimmed);
      return;
    }

    const controller = new AbortController();
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      setDebouncedQuery(trimmed);
      try {
        const result = await fetcherRef.current(trimmed, controller.signal);
        if (!controller.signal.aborted) setData(result);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setData(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, delayMs);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query, delayMs, enabled, minChars]);

  return { data, loading, error, debouncedQuery };
}
