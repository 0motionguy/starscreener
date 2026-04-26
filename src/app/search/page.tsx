"use client";

// /search — V2 search terminal.
//
// Client component wrapped in Suspense (required for useSearchParams).
// Renders a V2 page: TerminalBar header, breadcrumb mono link, V2 search
// bar, status line ("// SEARCHING…" or result count), then a
// TrendingTableV2 of results.
//
// Sidebar "Top 100" links here with ?sort=trending&limit=100. When
// there's no `q`, fall back to /api/repos?sort=stars-total so the page
// becomes a usable top-ranked list instead of the empty-state prompt.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Repo } from "@/lib/types";
import { useFilterStore } from "@/lib/store";
import { SearchBar } from "@/components/shared/SearchBar";
import { TrendingTableV2 } from "@/components/today-v2/TrendingTableV2";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchPageSkeletonV2 />}>
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
  const isTopList =
    !query.trim() && (sortParam !== null || limitParam !== null);
  const topLimit = Math.min(
    Math.max(Number.parseInt(limitParam ?? "100", 10) || 100, 1),
    100,
  );
  const topSort =
    sortParam === "stars" ? "stars-total" : sortParam ?? "stars-total";

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

  const status = isTopList
    ? `TOP ${topLimit}`
    : query.trim()
      ? loading
        ? "SEARCHING"
        : `${results.length} RESULT${results.length === 1 ? "" : "S"}`
      : "READY";

  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>
                {isTopList ? `TOP · ${topLimit} · BY ${topSort.toUpperCase()}` : "SEARCH · ALL REPOS"}
              </>
            }
            status={status}
          />

          <nav
            aria-label="Breadcrumb"
            className="v2-mono mt-6 inline-flex items-center gap-2"
            style={{
              color: "var(--v2-ink-400)",
              fontSize: 11,
              letterSpacing: "0.20em",
            }}
          >
            <Link
              href="/"
              style={{ color: "var(--v2-ink-300)" }}
            >
              HOME
            </Link>
            <span aria-hidden>›</span>
            <span style={{ color: "var(--v2-ink-100)" }}>
              {isTopList ? `TOP ${topLimit}` : "SEARCH"}
            </span>
          </nav>

          <div className="mt-4">
            <SearchBar
              fullWidth
              autoFocus
              placeholder="Search repos by name, language, topic..."
              onSearch={handleSearch}
            />
          </div>

          {query && (
            <p
              className="v2-mono mt-4"
              style={{ color: "var(--v2-ink-400)" }}
              aria-live="polite"
            >
              <span aria-hidden>{"// "}</span>
              {loading ? (
                <>
                  SEARCHING ·{" "}
                  <span style={{ color: "var(--v2-ink-100)" }}>
                    &ldquo;{query}&rdquo;
                  </span>
                </>
              ) : (
                <>
                  {results.length} RESULT{results.length !== 1 ? "S" : ""}{" "}
                  · FOR ·{" "}
                  <span style={{ color: "var(--v2-ink-100)" }}>
                    &ldquo;{query}&rdquo;
                  </span>
                </>
              )}
            </p>
          )}
        </div>
      </section>

      {(query.trim() || isTopList) && results.length > 0 ? (
        <TrendingTableV2 repos={results} sortBy="none" limit={topLimit} />
      ) : (
        <section>
          <div className="v2-frame py-12">
            {query.trim() && loading ? (
              <SearchLoadingV2 query={query} />
            ) : query.trim() ? (
              <SearchEmptyV2 query={query} />
            ) : (
              <SearchPromptV2 />
            )}
          </div>
        </section>
      )}
    </>
  );
}

function SearchPageSkeletonV2() {
  return (
    <section>
      <div className="v2-frame py-12">
        <div className="v2-card p-12 text-center">
          <p
            className="v2-mono"
            style={{ color: "var(--v2-ink-400)" }}
          >
            <span aria-hidden>{"// "}</span>
            INITIALIZING · SEARCH
          </p>
        </div>
      </div>
    </section>
  );
}

function SearchLoadingV2({ query }: { query: string }) {
  return (
    <div className="v2-card p-12 text-center">
      <p
        className="v2-mono mb-2"
        style={{ color: "var(--v2-acc)" }}
      >
        <span aria-hidden>{"// "}</span>
        SEARCHING
      </p>
      <p
        className="text-[14px]"
        style={{ color: "var(--v2-ink-200)" }}
      >
        Searching for &lsquo;{query}&rsquo;&hellip;
      </p>
    </div>
  );
}

function SearchEmptyV2({ query }: { query: string }) {
  return (
    <div className="v2-card p-12 text-center">
      <p
        className="v2-mono mb-3"
        style={{ color: "var(--v2-acc)" }}
      >
        <span aria-hidden>{"// "}</span>
        NO MATCHES
      </p>
      <p
        className="text-[15px] mb-3"
        style={{ color: "var(--v2-ink-100)" }}
      >
        No repos found for &lsquo;{query}&rsquo;
      </p>
      <p
        className="text-[13px] max-w-md mx-auto"
        style={{ color: "var(--v2-ink-300)" }}
      >
        Try searching for a repo name, programming language, or topic like
        &ldquo;rust&rdquo;, &ldquo;llm&rdquo;, or &ldquo;database&rdquo;.
      </p>
    </div>
  );
}

function SearchPromptV2() {
  return (
    <div className="v2-card p-12 text-center">
      <p
        className="v2-mono mb-3"
        style={{ color: "var(--v2-ink-300)" }}
      >
        <span aria-hidden>{"// "}</span>
        START TYPING
      </p>
      <p
        className="text-[15px] mb-2"
        style={{ color: "var(--v2-ink-100)" }}
      >
        Search across all tracked repos.
      </p>
      <p
        className="text-[13px]"
        style={{ color: "var(--v2-ink-300)" }}
      >
        Search by name, owner, language, topic, or description.
      </p>
    </div>
  );
}
