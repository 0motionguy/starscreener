"use client";

// useGlobalSearch — the shared data layer for global search.
//
// Extracted from the desktop Topbar so the mobile Search sheet consumes the
// EXACT same contract: GET /api/search/global (repos + LLMs, 180ms debounce)
// unioned with matchNavCommands() page hits, plus the canonical hit → href
// navigation rules. UI state (dropdown open, keyboard cursor, anchor) stays in
// the consumer; this hook owns only query + fetched data + navigation.
//
// (The Topbar still carries its own copy today; adopting this hook there to
// dedupe is a safe follow-up — the contract here is the source of truth.)

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { matchNavCommands, type NavCommand } from "@/lib/nav-commands";

export interface RepoHit {
  fullName: string;
  name: string;
  owner: string;
  description: string | null;
  stars: number;
  language: string | null;
  ownerAvatarUrl: string | null;
}

export interface LlmHit {
  slug: string;
  name: string;
  creator: string;
  intelligenceIndex: number | null;
}

export interface SearchResponse {
  ok: boolean;
  query: string;
  repos: RepoHit[];
  llms: LlmHit[];
  totals?: { repos: number; llms: number };
}

export type SearchHit =
  | { kind: "page"; item: NavCommand }
  | { kind: "repo"; item: RepoHit }
  | { kind: "llm"; item: LlmHit };

const DEBOUNCE_MS = 180;
export const MIN_QUERY = 1;

export function useGlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/global?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as SearchResponse;
        if (!cancelled) setResults(data);
      } catch {
        if (!cancelled) setResults({ ok: false, query: q, repos: [], llms: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  // Instant client-side page matches — same registry as ⌘K + AskDock.
  const pageHits = useMemo(() => matchNavCommands(query), [query]);

  // Flat ordered hit list (pages → repos → LLMs) for keyboard cursors.
  const hits = useMemo<SearchHit[]>(() => {
    const pages: SearchHit[] = pageHits.map((item) => ({ kind: "page", item }));
    const repos: SearchHit[] = results
      ? results.repos.map((item) => ({ kind: "repo", item }))
      : [];
    const llms: SearchHit[] = results
      ? results.llms.map((item) => ({ kind: "llm", item }))
      : [];
    return [...pages, ...repos, ...llms];
  }, [pageHits, results]);

  const hrefForHit = useCallback((hit: SearchHit): string => {
    if (hit.kind === "page") return hit.item.href;
    if (hit.kind === "repo") return `/repo/${hit.item.fullName}`;
    return `/?cat=llms#${encodeURIComponent(hit.item.slug)}`;
  }, []);

  const navigateToHit = useCallback(
    (hit: SearchHit) => {
      const href = hrefForHit(hit);
      setQuery("");
      router.push(href);
    },
    [router, hrefForHit],
  );

  return { query, setQuery, results, loading, pageHits, hits, hrefForHit, navigateToHit };
}
