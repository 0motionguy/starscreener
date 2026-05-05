"use client";

// SEO: canonical-only — metadata lives in sibling layout.tsx.
// StarScreener - Search.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search as SearchIcon, Clock, Sparkles, Tag } from "lucide-react";
import type { Repo } from "@/lib/types";
import { useFilterStore } from "@/lib/store";
import { SearchBar } from "@/components/shared/SearchBar";
import { TerminalLayout } from "@/components/terminal/TerminalLayout";

// AGN-608 — branded empty / no-results state.
//
// Persists the operator's last few queries in localStorage so the empty
// state isn't a black hole. Caps at 6 entries; older items get evicted
// FIFO. Read on mount only (no live sync between tabs — these are hints,
// not source of truth).
const RECENT_SEARCHES_KEY = "starscreener:recent-searches";
const RECENT_SEARCHES_MAX = 6;

const EXAMPLE_QUERIES = [
  "rust",
  "llm",
  "agents",
  "database",
  "typescript",
  "vector",
  "kubernetes",
  "fastapi",
];

const POPULAR_CATEGORIES: { id: string; label: string }[] = [
  { id: "ai-agents", label: "AI Agents" },
  { id: "mcp", label: "MCP" },
  { id: "devtools", label: "DevTools" },
  { id: "browser-automation", label: "Browser Automation" },
  { id: "llm-infra", label: "LLM Infra" },
  { id: "rust", label: "Rust" },
];

function readRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .slice(0, RECENT_SEARCHES_MAX);
  } catch {
    return [];
  }
}

function writeRecentSearch(query: string) {
  if (typeof window === "undefined") return;
  const trimmed = query.trim();
  if (!trimmed) return;
  try {
    const existing = readRecentSearches();
    const next = [
      trimmed,
      ...existing.filter((q) => q.toLowerCase() !== trimmed.toLowerCase()),
    ].slice(0, RECENT_SEARCHES_MAX);
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // Quota / disabled storage — silent. Suggestions just won't persist.
  }
}

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
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Hydrate recent-searches from localStorage on mount (client-only).
  useEffect(() => {
    setRecentSearches(readRecentSearches());
  }, []);

  // Once a query produces ≥1 result, record it as a recent search so the
  // empty state has something useful to show next time.
  useEffect(() => {
    if (!query.trim() || loading) return;
    if (results.length === 0) return;
    writeRecentSearch(query);
    setRecentSearches(readRecentSearches());
  }, [query, loading, results.length]);

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
            <SearchEmpty
              query={query}
              recentSearches={recentSearches}
              onPickQuery={handleSearch}
            />
          )
        ) : (
          <SearchPrompt
            recentSearches={recentSearches}
            onPickQuery={handleSearch}
          />
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

// AGN-608 — Branded empty state for "no results for <query>".
//
// Keeps the existing terminal `.search-state` chrome (caps mono headline,
// muted icon, hint copy) for visual continuity and adds a Suggestions
// block: recent queries (when present) + example queries + popular
// categories. Each suggestion is a real action — clicking a query
// re-fires the search via `onPickQuery`; clicking a category navigates
// to /categories/[slug].
function SearchEmpty({
  query,
  recentSearches,
  onPickQuery,
}: {
  query: string;
  recentSearches: string[];
  onPickQuery: (q: string) => void;
}) {
  return (
    <div className="search-state">
      <SearchIcon
        size={32}
        className="search-state-icon muted"
        aria-hidden="true"
      />
      <p>{`// NO REPOS FOUND FOR "${query}"`}</p>
      <p className="hint">
        Nothing matched in the live index. Try a different spelling, a
        broader topic, or pick one of the suggestions below.
      </p>
      <SearchSuggestions
        recentSearches={recentSearches}
        onPickQuery={onPickQuery}
      />
    </div>
  );
}

// AGN-608 — Branded "type to search" state for empty query.
//
// Replaces the previous one-line placeholder with a brief explainer
// of what the index covers + the same Suggestions block so the page
// is never blank.
function SearchPrompt({
  recentSearches,
  onPickQuery,
}: {
  recentSearches: string[];
  onPickQuery: (q: string) => void;
}) {
  return (
    <div className="search-state">
      <SearchIcon
        size={32}
        className="search-state-icon muted"
        aria-hidden="true"
      />
      <p>{"// SEARCH THE LIVE GITHUB INDEX"}</p>
      <p className="hint">
        Type a repo name, owner, language, topic, or keyword. We screen
        every tracked repo across the trending stack and surface matches
        with momentum, stars, and category context.
      </p>
      <SearchSuggestions
        recentSearches={recentSearches}
        onPickQuery={onPickQuery}
      />
    </div>
  );
}

// AGN-608 — Shared Suggestions block.
//
// Three groups, each gated on having content:
//   1. Recent searches — rendered when the operator has previously
//      executed a query that returned results (localStorage-backed).
//   2. Example queries — always rendered. A curated set so first-time
//      visitors have a one-click way to try the index.
//   3. Popular categories — always rendered. Real links to /categories
//      so users who don't want to type at all have an exit.
//
// Buttons reuse `v2-btn v2-btn-ghost` to match existing chrome (HomeEmptyState,
// search/error.tsx) — no new component, no new tokens.
function SearchSuggestions({
  recentSearches,
  onPickQuery,
}: {
  recentSearches: string[];
  onPickQuery: (q: string) => void;
}) {
  return (
    <div className="search-suggestions">
      {recentSearches.length > 0 && (
        <SuggestionGroup
          icon={<Clock size={12} aria-hidden="true" />}
          label="// RECENT"
        >
          {recentSearches.map((q) => (
            <button
              key={`recent-${q}`}
              type="button"
              onClick={() => onPickQuery(q)}
              className="v2-btn v2-btn-ghost search-suggest-chip"
            >
              {q}
            </button>
          ))}
        </SuggestionGroup>
      )}

      <SuggestionGroup
        icon={<Sparkles size={12} aria-hidden="true" />}
        label="// TRY AN EXAMPLE"
      >
        {EXAMPLE_QUERIES.map((q) => (
          <button
            key={`example-${q}`}
            type="button"
            onClick={() => onPickQuery(q)}
            className="v2-btn v2-btn-ghost search-suggest-chip"
          >
            {q}
          </button>
        ))}
      </SuggestionGroup>

      <SuggestionGroup
        icon={<Tag size={12} aria-hidden="true" />}
        label="// BROWSE A CATEGORY"
      >
        {POPULAR_CATEGORIES.map((cat) => (
          <Link
            key={`cat-${cat.id}`}
            href={`/categories/${cat.id}`}
            className="v2-btn v2-btn-ghost search-suggest-chip"
          >
            {cat.label}
          </Link>
        ))}
      </SuggestionGroup>
    </div>
  );
}

function SuggestionGroup({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="search-suggest-group">
      <div className="search-suggest-label">
        {icon}
        <span>{label}</span>
      </div>
      <div className="search-suggest-chips">{children}</div>
    </div>
  );
}
