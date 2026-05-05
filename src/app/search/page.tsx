"use client";

// StarScreener - Search.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Search as SearchIcon } from "lucide-react";
import type { Repo } from "@/lib/types";
import { useFilterStore } from "@/lib/store";
import { SearchBar } from "@/components/shared/SearchBar";

const TerminalLayout = dynamic(
  () =>
    import("@/components/terminal/TerminalLayout").then((m) => ({
      default: m.TerminalLayout,
    })),
  {
    ssr: false,
    loading: () => <SearchResultsShell />,
  },
);

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
  const queryText = query.trim();
  const hasQuery = queryText.length > 0;
  const sortParam = searchParams.get("sort");
  const limitParam = searchParams.get("limit");
  const isTopList = !hasQuery && (sortParam !== null || limitParam !== null);
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
    if (!hasQuery && !isTopList) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const url = hasQuery
      ? `/api/search?q=${encodeURIComponent(queryText)}&limit=50`
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
  }, [hasQuery, isTopList, queryText, topSort, topLimit]);

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
            {hasQuery ? `${results.length}` : isTopList ? `${topLimit}` : "global"}
          </span>
          <span className="live">{loading ? "searching" : "ready"}</span>
        </div>
      </section>

      <section className="panel search-command-panel">
        <div className="panel-head">
          <span className="key">{"// GLOBAL SEARCH"}</span>
          <span className="right">
            <span className="live">{queryText || "operator prompt"}</span>
          </span>
        </div>
        <div className="search-command-body">
          <SearchBar
            fullWidth
            autoFocus
            placeholder="Search repos by name, language, topic..."
            onSearch={handleSearch}
          />
          {hasQuery && (
            <p className="search-result-meta" aria-live="polite">
              {loading ? (
                <>
                  <span className="live-dot" aria-hidden />
                  Searching for <b>{queryText}</b>
                </>
              ) : (
                <>
                  <b>{results.length}</b> result
                  {results.length !== 1 ? "s" : ""} for <b>{queryText}</b>
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
        hasQuery ? (
          loading ? (
            <SearchLoading query={queryText} />
          ) : (
            <SearchEmpty query={queryText} />
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
  const quickQueries = ["openai", "rust", "agent", "database"];

  return (
    <div className="search-state">
      <SearchIcon
        size={32}
        className="search-state-icon muted"
        aria-hidden="true"
      />
      <p>{`// NO REPOS FOUND FOR "${query}"`}</p>
      <div className="search-empty-card" role="note" aria-live="polite">
        <p className="search-empty-title">Nothing matched this query in the live index.</p>
        <p className="hint search-empty-copy">
          Search supports owner/name, language tags, and topic keywords. Try a
          shorter term, remove punctuation, or use one of these quick probes:
        </p>
        <div className="search-empty-pills">
          {quickQueries.map((suggestion) => (
            <Link
              key={suggestion}
              href={`/search?q=${encodeURIComponent(suggestion)}`}
              className="search-empty-pill"
            >
              {suggestion}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function SearchResultsShell() {
  return (
    <div className="panel p-4">
      <div className="skeleton-shimmer h-5 w-40 rounded-sm" />
      <div className="mt-3 space-y-2">
        <div className="skeleton-shimmer h-10 w-full rounded-sm" />
        <div className="skeleton-shimmer h-10 w-full rounded-sm" />
        <div className="skeleton-shimmer h-10 w-full rounded-sm" />
      </div>
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
