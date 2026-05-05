"use client";

// StarScreener - Search.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Search as SearchIcon, Clock, Sparkles, Tag } from "lucide-react";
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

const CATEGORY_VALUES = ["mcp", "skill", "agent", "library"] as const;
type CategoryValue = (typeof CATEGORY_VALUES)[number];

function isCategoryValue(value: string | null): value is CategoryValue {
  return value !== null && (CATEGORY_VALUES as readonly string[]).includes(value);
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const queryText = query.trim();
  const hasQuery = queryText.length > 0;
  const rawCategory = searchParams.get("category");
  const category: CategoryValue | null = isCategoryValue(rawCategory)
    ? rawCategory
    : null;
  const hasCategory = category !== null;
  const sortParam = searchParams.get("sort");
  const limitParam = searchParams.get("limit");
  const isTopList =
    !hasQuery && !hasCategory && (sortParam !== null || limitParam !== null);
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
    if (!hasQuery && !hasCategory && !isTopList) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    // /api/search supports facet-only queries (e.g. `?category=mcp`) at v=1
    // — the route's `hasAnyFacet` short-circuit treats `category` as a facet.
    let url: string;
    if (hasQuery || hasCategory) {
      const params = new URLSearchParams();
      if (hasQuery) params.set("q", queryText);
      if (hasCategory) params.set("category", category);
      params.set("limit", "50");
      url = `/api/search?${params.toString()}`;
    } else {
      url = `/api/repos?sort=${encodeURIComponent(topSort)}&limit=${topLimit}`;
    }

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
  }, [hasQuery, hasCategory, category, isTopList, queryText, topSort, topLimit]);

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

  const handleCategoryClick = useCallback(
    (next: CategoryValue) => {
      const params = new URLSearchParams(searchParams.toString());
      // Toggle: clicking the active chip clears the filter.
      if (params.get("category") === next) {
        params.delete("category");
      } else {
        params.set("category", next);
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
          <div
            className="search-category-chips"
            role="group"
            aria-label="Filter by category"
          >
            {CATEGORY_VALUES.map((value) => {
              const active = category === value;
              return (
                <button
                  key={value}
                  type="button"
                  className={`search-category-chip${active ? " is-active" : ""}`}
                  aria-pressed={active}
                  onClick={() => handleCategoryClick(value)}
                >
                  {value}
                </button>
              );
            })}
          </div>
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
