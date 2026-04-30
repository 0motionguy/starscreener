"use client";

// StarScreener - Search.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search as SearchIcon } from "lucide-react";
import type { Repo } from "@/lib/types";
import { useFilterStore } from "@/lib/store";
import { SearchBar } from "@/components/shared/SearchBar";
import { TerminalLayout } from "@/components/terminal/TerminalLayout";

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchPageSkeleton />}>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const sortParam = searchParams.get("sort");
  const limitParam = searchParams.get("limit");
  const isTopList = !query.trim() && (sortParam !== null || limitParam !== null);
  const topLimit = Math.min(
    Math.max(Number.parseInt(limitParam ?? "100", 10) || 100, 1),
    100,
  );
  const topSort =
    sortParam === "stars" ? "stars-total" : (sortParam ?? "stars-total");

  const [results, setResults] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);

  const setSort = useFilterStore((s) => s.setSort);
  useEffect(() => {
    if (isTopList) {
      setSort("stars", "desc");
    }
  }, [isTopList, setSort]);

  useEffect(() => {
    if (!query.trim() && !isTopList) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const url = query.trim()
      ? `/api/search?q=${encodeURIComponent(query)}&limit=50`
      : `/api/repos?sort=${encodeURIComponent(topSort)}&limit=${topLimit}`;

    (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as {
          results?: Repo[];
          repos?: Repo[];
        };
        const list = Array.isArray(data.results)
          ? data.results
          : Array.isArray(data.repos)
            ? data.repos
            : [];
        setResults(list);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        console.error("[search] fetch failed", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [query, isTopList, topSort, topLimit]);

  const handleSearch = useCallback(
    (q: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (q.trim()) {
        params.set("q", q.trim());
      } else {
        params.delete("q");
      }
      router.replace(`/search?${params.toString()}`);
    },
    [router, searchParams],
  );

  const heading = (
    <>
      <section className="page-head">
        <div>
          <div className="crumb">
            <Link href="/">Trend terminal</Link>
            <span> / </span>
            <b>search</b>
          </div>
          <h1>Search every repo in the live index.</h1>
          <p className="lede">
            Query by owner, repo name, language, topic, or description without
            leaving the terminal grid.
          </p>
        </div>
        <div className="clock">
          <span className="big">
            {query ? `${results.length}` : isTopList ? `${topLimit}` : "global"}
          </span>
          <span className="live">{loading ? "searching" : "ready"}</span>
        </div>
      </section>

      <section className="panel search-command-panel">
        <div className="panel-head">
          <span className="key">{"// GLOBAL SEARCH"}</span>
          <span className="right">
            <span className="live">{query || "operator prompt"}</span>
          </span>
        </div>
        <div className="search-command-body">
          <SearchBar
            fullWidth
            autoFocus
            placeholder="Search repos by name, language, topic..."
            onSearch={handleSearch}
          />
          {query && (
            <p className="search-result-meta" aria-live="polite">
              {loading ? (
                <>
                  <span className="live-dot" aria-hidden />
                  Searching for <b>{query}</b>
                </>
              ) : (
                <>
                  <b>{results.length}</b> result
                  {results.length !== 1 ? "s" : ""} for <b>{query}</b>
                </>
              )}
            </p>
          )}
        </div>
      </section>
    </>
  );

  return (
    <TerminalLayout
      repos={results}
      className="home-surface terminal-page search-page"
      filterBarVariant="search"
      showFeatured={false}
      heading={heading}
      emptyState={
        query ? (
          loading ? (
            <SearchLoading query={query} />
          ) : (
            <SearchEmpty query={query} />
          )
        ) : (
          <SearchPrompt />
        )
      }
    />
  );
}

function SearchPageSkeleton() {
  return (
    <div className="home-surface terminal-page search-page">
      <div className="page-head">
        <div>
          <div className="crumb">
            <b>Search</b> / loading
          </div>
          <h1>Search every repo in the live index.</h1>
          <p className="lede">Preparing the terminal surface.</p>
        </div>
      </div>
    </div>
  );
}

function SearchLoading({ query }: { query: string }) {
  return (
    <div className="search-state">
      <SearchIcon size={32} className="search-state-icon" aria-hidden="true" />
      <p>{`// SEARCHING FOR "${query}"...`}</p>
    </div>
  );
}

function SearchEmpty({ query }: { query: string }) {
  return (
    <div className="search-state">
      <SearchIcon
        size={32}
        className="search-state-icon muted"
        aria-hidden="true"
      />
      <p>{`// NO REPOS FOUND FOR "${query}"`}</p>
      <p className="hint">
        Try a repo name, language, or topic like rust, llm, or database.
      </p>
    </div>
  );
}

function SearchPrompt() {
  return (
    <div className="search-state">
      <SearchIcon
        size={32}
        className="search-state-icon muted"
        aria-hidden="true"
      />
      <p>{"// START TYPING TO SEARCH ACROSS ALL REPOS"}</p>
      <p className="hint">
        Search by name, owner, language, topic, or description.
      </p>
    </div>
  );
}
