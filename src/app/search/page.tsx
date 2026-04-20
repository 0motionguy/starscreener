"use client";

// StarScreener — Search (Phase 3)
//
// Client component wrapped in Suspense (required for useSearchParams).
// Renders the search bar + result count as a heading slot above a
// TerminalLayout with the `search` FilterBar variant (no metas/stats/tabs,
// only view controls). Featured cards are hidden — search is a pure
// result surface.
//
// Data source is the live `/api/search` route; mock fallbacks removed in
// Phase 0. The route returns `{ results: Repo[], meta: { total, query } }`.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search as SearchIcon } from "lucide-react";
import type { Repo } from "@/lib/types";
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
  // Sidebar "Top 100" links here with ?sort=trending&limit=100. When there's no
  // `q`, fall back to /api/repos?sort=stars so the page becomes a usable
  // top-ranked list instead of the empty-state prompt.
  const sortParam = searchParams.get("sort");
  const limitParam = searchParams.get("limit");
  const isTopList = !query.trim() && (sortParam !== null || limitParam !== null);
  const topLimit = Math.min(Math.max(Number.parseInt(limitParam ?? "100", 10) || 100, 1), 100);
  // /api/repos accepts: trending | momentum | stars-today | stars-total | newest.
  // The Top 100 sidebar link sends sort=stars-total so this becomes a pure
  // star-ranked list.
  const topSort = sortParam === "stars" ? "stars-total" : (sortParam ?? "stars-total");

  const [results, setResults] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);

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
    <div className="px-4 sm:px-6 pt-6 pb-2 space-y-4">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs text-text-tertiary"
      >
        <Link href="/" className="hover:text-text-primary transition-colors">
          Home
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-text-primary">Search</span>
      </nav>
      <SearchBar
        fullWidth
        autoFocus
        placeholder="Search repos by name, language, topic..."
        onSearch={handleSearch}
      />
      {query && (
        <p className="text-sm text-text-tertiary" aria-live="polite">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span
                className="size-1.5 rounded-full bg-text-tertiary animate-pulse"
                aria-hidden
              />
              Searching for{" "}
              <span className="text-text-primary font-medium">
                &ldquo;{query}&rdquo;
              </span>
            </span>
          ) : (
            <>
              {results.length} result{results.length !== 1 ? "s" : ""} for{" "}
              <span className="text-text-primary font-medium">
                &ldquo;{query}&rdquo;
              </span>
            </>
          )}
        </p>
      )}
    </div>
  );

  return (
    <TerminalLayout
      repos={results}
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

// ---------------------------------------------------------------------------
// Supplementary surfaces
// ---------------------------------------------------------------------------

function SearchPageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="h-12 bg-bg-tertiary rounded-[var(--radius-card)] animate-pulse mb-6" />
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-20 bg-bg-tertiary rounded-[var(--radius-badge)] animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

function SearchLoading({ query }: { query: string }) {
  return (
    <div className="text-center py-20 px-4">
      <SearchIcon
        size={40}
        className="mx-auto mb-4 text-text-muted animate-pulse"
        aria-hidden="true"
      />
      <p className="text-text-secondary text-lg">
        Searching for &lsquo;{query}&rsquo;&hellip;
      </p>
    </div>
  );
}

function SearchEmpty({ query }: { query: string }) {
  return (
    <div className="text-center py-20 px-4">
      <SearchIcon
        size={40}
        className="mx-auto mb-4 text-text-muted"
        aria-hidden="true"
      />
      <p className="text-text-tertiary text-lg">
        No repos found for &lsquo;{query}&rsquo;
      </p>
      <p className="text-text-muted text-sm mt-2 max-w-md mx-auto">
        Try searching for a repo name, programming language, or topic like
        &ldquo;rust&rdquo;, &ldquo;llm&rdquo;, or &ldquo;database&rdquo;.
      </p>
    </div>
  );
}

function SearchPrompt() {
  return (
    <div className="text-center py-20 px-4">
      <SearchIcon
        size={40}
        className="mx-auto mb-4 text-text-muted"
        aria-hidden="true"
      />
      <p className="text-text-secondary text-lg">
        Start typing to search across all repos
      </p>
      <p className="text-text-muted text-sm mt-1">
        Search by name, owner, language, topic, or description
      </p>
    </div>
  );
}
