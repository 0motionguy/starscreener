"use client";

// StarScreener — CompareSelector.
//
// Search + pills UI for picking up to MAX_COMPARE_REPOS repos. Phase 0
// stripped mock data; this component now hits:
//   - /api/search?q=<q>&limit=8  → suggest matches as the user types
//   - /api/repos?ids=a,b,c       → hydrate the pills for the current
//                                   compare selection (cached per id)
//
// Suggestions are debounced 200ms so typing doesn't burn requests. The
// resolved-names map is populated lazily: whenever the compare store's
// repo IDs list changes, we fetch any ids we haven't seen yet and merge
// the result into a cached map keyed by id. Pills always render a
// reasonable fallback (raw id) before the async hydrate finishes.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { X, Plus, Trash2, Search } from "lucide-react";
import { useCompareStore } from "@/lib/store";
import type { Repo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MAX_COMPARE_REPOS } from "@/lib/constants";
import { useDebouncedSearch } from "@/hooks/useDebouncedSearch";

const SLOT_COLORS = [
  { border: "border-accent-green", text: "text-accent-green", dot: "bg-accent-green" },
  { border: "border-accent-blue", text: "text-accent-blue", dot: "bg-accent-blue" },
  { border: "border-accent-purple", text: "text-accent-purple", dot: "bg-accent-purple" },
  { border: "border-accent-amber", text: "text-accent-amber", dot: "bg-accent-amber" },
  { border: "border-accent-red", text: "text-accent-red", dot: "bg-accent-red" },
];

const SEARCH_DEBOUNCE_MS = 200;

/** Compact per-id cache — we only need the display fields. */
interface RepoRef {
  fullName: string;
  ownerAvatarUrl: string;
  language: string | null;
  stars: number;
}

export function CompareSelector() {
  const { repos, addRepo, removeRepo, clearAll, isFull } = useCompareStore();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [refsById, setRefsById] = useState<Record<string, RepoRef>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Close dropdown on Escape or outside click ----------------------
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        setQuery("");
      }
    }
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // --- Debounced search ------------------------------------------------
  // Refetches only when the query changes; the `repos` filter is applied
  // downstream in `suggestions` so adding/removing pills doesn't burn a
  // network round-trip.
  const { data: rawSuggestions, loading: suggestLoading } = useDebouncedSearch<
    Repo[]
  >(
    query,
    async (q, signal) => {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&limit=8`,
        { signal },
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { results?: Repo[] };
      return Array.isArray(data.results) ? data.results : [];
    },
    { delayMs: SEARCH_DEBOUNCE_MS, minChars: 1 },
  );

  // Merge fresh hits into the ref cache so pills for ids we happen to
  // surface are name-resolved without a second round-trip.
  useEffect(() => {
    if (!rawSuggestions || rawSuggestions.length === 0) return;
    setRefsById((prev) => {
      const next = { ...prev };
      for (const r of rawSuggestions) {
        next[r.id] = {
          fullName: r.fullName,
          ownerAvatarUrl: r.ownerAvatarUrl,
          language: r.language,
          stars: r.stars,
        };
      }
      return next;
    });
  }, [rawSuggestions]);

  // Filter out repos already in the compare list.
  const suggestions = useMemo<Repo[]>(
    () => (rawSuggestions ?? []).filter((r) => !repos.includes(r.id)),
    [rawSuggestions, repos],
  );

  // --- Hydrate pill refs whenever the compare list changes -----------
  useEffect(() => {
    // Only fetch ids we haven't already resolved.
    const missing = repos.filter((id) => !refsById[id]);
    if (missing.length === 0) return;

    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/repos?ids=${encodeURIComponent(missing.join(","))}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { repos?: Repo[] };
        const items = Array.isArray(data.repos) ? data.repos : [];
        setRefsById((prev) => {
          const next = { ...prev };
          for (const r of items) {
            next[r.id] = {
              fullName: r.fullName,
              ownerAvatarUrl: r.ownerAvatarUrl,
              language: r.language,
              stars: r.stars,
            };
          }
          return next;
        });
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        console.error("[compare:hydrate] failed", err);
      }
    })();

    return () => controller.abort();
    // refsById intentionally omitted — we derive `missing` inside, and
    // including it would re-run on every set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos]);

  const handleSelect = useCallback(
    (id: string) => {
      addRepo(id);
      setQuery("");
      setIsOpen(false);
    },
    [addRepo],
  );

  const openSearch = useCallback(() => {
    if (isFull()) return;
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [isFull]);

  // Resolve a pill's display name (falls back to raw id while hydrating).
  const getRepoName = useCallback(
    (id: string) => refsById[id]?.fullName ?? id,
    [refsById],
  );

  const emptySlots = MAX_COMPARE_REPOS - repos.length;

  const showNoResults = useMemo(
    () =>
      Boolean(query.trim()) && !suggestLoading && suggestions.length === 0,
    [query, suggestLoading, suggestions.length],
  );

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary font-mono">
          ({repos.length}/{MAX_COMPARE_REPOS})
        </p>
        {repos.length >= 2 && (
          <button
            type="button"
            onClick={clearAll}
            className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-accent-red transition-colors cursor-pointer"
          >
            <Trash2 size={12} />
            Clear all
          </button>
        )}
      </div>

      {/* Pills + empty slots */}
      <div className="flex flex-wrap items-center gap-2">
        {repos.map((id, i) => {
          const color = SLOT_COLORS[i % SLOT_COLORS.length];
          const name = getRepoName(id);
          return (
            <div
              key={id}
              className={cn(
                "bg-bg-card rounded-badge px-3 py-1.5 border flex items-center gap-2",
                "animate-fade-in",
                color.border,
              )}
            >
              <span
                className={cn("size-2 rounded-full shrink-0", color.dot)}
                aria-hidden="true"
              />
              <span className="text-sm text-text-primary font-medium truncate max-w-[180px]">
                {name}
              </span>
              <button
                type="button"
                onClick={() => removeRepo(id)}
                className={cn(
                  "p-0.5 rounded-full hover:bg-bg-card-hover transition-colors cursor-pointer",
                  "text-text-tertiary hover:text-text-primary",
                )}
                aria-label={`Remove ${name}`}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}

        {/* Empty slots */}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <button
            key={`empty-${i}`}
            type="button"
            onClick={openSearch}
            className={cn(
              "rounded-badge px-3 py-1.5 border border-dashed border-border-primary",
              "flex items-center gap-1.5 text-sm text-text-tertiary",
              "hover:border-text-secondary hover:text-text-secondary transition-colors cursor-pointer",
              isFull() && "opacity-50 pointer-events-none",
            )}
          >
            <Plus size={14} />
            Add repo
          </button>
        ))}
      </div>

      {/* Search dropdown */}
      <div className="relative" ref={dropdownRef}>
        {isOpen && (
          <div className="space-y-2 animate-fade-in">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name..."
                aria-label="Search repos to compare"
                className={cn(
                  "w-full h-9 pl-9 pr-4",
                  "v2-card",
                  "text-sm font-mono text-text-primary placeholder:text-text-tertiary",
                  "outline-none",
                  "focus:border-accent-green/50 focus:ring-1 focus:ring-accent-green/20",
                  "transition-colors",
                )}
              />
            </div>

            {suggestions.length > 0 && (
              <div className="v2-card overflow-hidden">
                {suggestions.map((repo) => (
                  <button
                    key={repo.id}
                    type="button"
                    onClick={() => handleSelect(repo.id)}
                    className={cn(
                      "w-full px-3 py-2 flex items-center gap-3 text-left",
                      "hover:bg-bg-card-hover transition-colors cursor-pointer",
                      "border-b border-border-primary last:border-b-0",
                    )}
                  >
                    <Image
                      src={repo.ownerAvatarUrl}
                      alt=""
                      width={20}
                      height={20}
                      className="size-5 rounded-full bg-bg-card-hover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary font-medium truncate">
                        {repo.fullName}
                      </p>
                      <p className="text-xs text-text-tertiary truncate">
                        {repo.language ?? "Unknown"} -- {repo.stars.toLocaleString("en-US")} stars
                      </p>
                    </div>
                    <Plus size={14} className="text-text-tertiary shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {suggestLoading && suggestions.length === 0 && (
              <p className="text-sm text-text-tertiary px-1 py-2">
                Searching&hellip;
              </p>
            )}

            {showNoResults && (
              <p className="text-sm text-text-tertiary px-1 py-2">
                No repos found matching &ldquo;{query}&rdquo;
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
