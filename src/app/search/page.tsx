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

  // Top-100 list needs the terminal grid to show stars-desc. The client
  // <Terminal/> re-sorts every fetched result through useSortedRepos against
  // the persisted filterStore sort (defaults to rank/asc = momentum), which
  // silently overrode the API's star ordering — so the UI looked like a
  // random list instead of "1 to 100 by most stars". Force the sort here.
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
    <div className="px-4 sm:px-6 pt-6 pb-2 space-y-4">
      {/* V2 operator eyebrow */}
      <div
        className="flex items-center gap-3 pb-1"
        style={{ borderBottom: "1px solid var(--v2-line-std)" }}
      >
        <span
          className="v2-mono"
          style={{ fontSize: 10, color: "var(--v2-ink-400)" }}
        >
          {"// 01 · SEARCH · GLOBAL · OPERATOR-LEVEL"}
        </span>
        <nav
          aria-label="Breadcrumb"
          className="ml-auto flex items-center gap-1.5"
          style={{ fontSize: 11, color: "var(--v2-ink-400)" }}
        >
          <Link
            href="/"
            className="transition-colors v2-mono"
            style={{ fontSize: 10, color: "var(--v2-ink-300)" }}
          >
            HOME
          </Link>
          <span aria-hidden style={{ color: "var(--v2-line-300)" }}>
            ›
          </span>
          <span
            className="v2-mono"
            style={{ fontSize: 10, color: "var(--v2-ink-200)" }}
          >
            SEARCH
          </span>
        </nav>
      </div>

      <SearchBar
        fullWidth
        autoFocus
        placeholder="Search repos by name, language, topic..."
        onSearch={handleSearch}
      />

      {query && (
        <p
          className="v2-mono tabular-nums"
          style={{ fontSize: 11, color: "var(--v2-ink-300)" }}
          aria-live="polite"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="v2-live-dot" aria-hidden />
              {"// SEARCHING FOR "}
              <span style={{ color: "var(--v2-acc)" }}>
                &ldquo;{query}&rdquo;
              </span>
            </span>
          ) : (
            <>
              <span style={{ color: "var(--v2-ink-100)" }}>
                {results.length}
              </span>
              {" RESULT"}
              {results.length !== 1 ? "S" : ""}
              {" FOR "}
              <span style={{ color: "var(--v2-acc)" }}>
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
        size={32}
        className="mx-auto mb-4 animate-pulse"
        style={{ color: "var(--v2-acc)" }}
        aria-hidden="true"
      />
      <p
        className="v2-mono"
        style={{ fontSize: 12, color: "var(--v2-ink-200)" }}
      >
        {`// SEARCHING FOR "${query}" …`}
      </p>
    </div>
  );
}

function SearchEmpty({ query }: { query: string }) {
  return (
    <div className="text-center py-20 px-4">
      <SearchIcon
        size={32}
        className="mx-auto mb-4"
        style={{ color: "var(--v2-ink-400)" }}
        aria-hidden="true"
      />
      <p
        className="v2-mono"
        style={{ fontSize: 12, color: "var(--v2-ink-300)" }}
      >
        {`// NO REPOS FOUND FOR "${query}"`}
      </p>
      <p
        className="mt-2 max-w-md mx-auto"
        style={{ fontSize: 12, color: "var(--v2-ink-400)" }}
      >
        Try a repo name, language, or topic like &ldquo;rust&rdquo;,
        &ldquo;llm&rdquo;, or &ldquo;database&rdquo;.
      </p>
    </div>
  );
}

function SearchPrompt() {
  return (
    <div className="text-center py-20 px-4">
      <SearchIcon
        size={32}
        className="mx-auto mb-4"
        style={{ color: "var(--v2-ink-400)" }}
        aria-hidden="true"
      />
      <p
        className="v2-mono"
        style={{ fontSize: 12, color: "var(--v2-ink-200)" }}
      >
        {"// START TYPING TO SEARCH ACROSS ALL REPOS"}
      </p>
      <p
        className="mt-1"
        style={{ fontSize: 11, color: "var(--v2-ink-400)" }}
      >
        Search by name, owner, language, topic, or description.
      </p>
    </div>
  );
}
