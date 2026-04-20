"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Star, X } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import type { Repo } from "@/lib/types";

interface SearchBarProps {
  placeholder?: string;
  fullWidth?: boolean;
  onSearch?: (query: string) => void;
  autoFocus?: boolean;
}

/**
 * Minimum chars before we fire an autocomplete request. 2 balances
 * "useful preview even for terse queries like 'ai'" against wasted
 * round-trips on a single-letter keystroke.
 */
const PREVIEW_MIN_CHARS = 2;
const PREVIEW_LIMIT = 8;

export function SearchBar({
  placeholder = "Search repos...",
  fullWidth = false,
  onSearch,
  autoFocus = false,
}: SearchBarProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [value, setValue] = useState("");

  // Autocomplete state — only used when `onSearch` is NOT provided
  // (parent isn't rendering its own results panel, e.g. the Header).
  const showPreview = !onSearch;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewResults, setPreviewResults] = useState<Repo[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  // Cleanup debounce + in-flight fetch on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Click-outside closes the preview dropdown.
  useEffect(() => {
    if (!previewOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setPreviewOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [previewOpen]);

  const fetchPreview = useCallback(
    (q: string) => {
      if (q.length < PREVIEW_MIN_CHARS) {
        setPreviewResults([]);
        setPreviewLoading(false);
        setPreviewOpen(false);
        return;
      }
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPreviewLoading(true);
      setPreviewOpen(true);
      fetch(
        `/api/search?q=${encodeURIComponent(q)}&limit=${PREVIEW_LIMIT}`,
        { signal: controller.signal },
      )
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
        .then((data: { results?: Repo[] }) => {
          setPreviewResults(Array.isArray(data.results) ? data.results : []);
          setHighlight(-1);
        })
        .catch((err: unknown) => {
          if ((err as { name?: string }).name === "AbortError") return;
          setPreviewResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewLoading(false);
        });
    },
    [],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setValue(q);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (onSearch) onSearch(q);
        if (showPreview) fetchPreview(q.trim());
      }, 200);
    },
    [onSearch, showPreview, fetchPreview],
  );

  const gotoRepo = useCallback(
    (repo: Repo) => {
      router.push(`/repo/${repo.owner}/${repo.name}`);
      setPreviewOpen(false);
      setValue("");
      inputRef.current?.blur();
    },
    [router],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (showPreview && previewOpen && previewResults.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlight((h) => (h + 1) % previewResults.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlight((h) =>
            h <= 0 ? previewResults.length - 1 : h - 1,
          );
          return;
        }
        if (e.key === "Escape") {
          setPreviewOpen(false);
          return;
        }
        if (e.key === "Enter" && highlight >= 0) {
          e.preventDefault();
          gotoRepo(previewResults[highlight]);
          return;
        }
      }
      if (e.key === "Enter") {
        const q = value.trim();
        if (q) {
          router.push(`${ROUTES.SEARCH}?q=${encodeURIComponent(q)}`);
          setPreviewOpen(false);
        }
      }
    },
    [showPreview, previewOpen, previewResults, highlight, value, router, gotoRepo],
  );

  const handleClear = useCallback(() => {
    setValue("");
    setPreviewResults([]);
    setPreviewOpen(false);
    onSearch?.("");
    inputRef.current?.focus();
  }, [onSearch]);

  return (
    <div
      ref={containerRef}
      className={cn("relative", fullWidth ? "w-full" : "w-64")}
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (showPreview && value.trim().length >= PREVIEW_MIN_CHARS) {
            setPreviewOpen(true);
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        role={showPreview ? "combobox" : undefined}
        aria-expanded={showPreview ? previewOpen : undefined}
        aria-controls={showPreview ? "search-preview" : undefined}
        aria-autocomplete={showPreview ? "list" : undefined}
        className={cn(
          "w-full h-9 pl-9 pr-8",
          "bg-bg-secondary border border-border-primary rounded-card",
          "text-sm font-mono text-text-primary placeholder:text-text-muted",
          "outline-none",
          "focus:border-accent-green/50 focus:ring-1 focus:ring-accent-green/20",
          "transition-colors"
        )}
      />

      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {showPreview && previewOpen && (
        <div
          id="search-preview"
          role="listbox"
          className={cn(
            "absolute left-0 right-0 top-full mt-1 z-50",
            "bg-bg-card border border-border-primary rounded-card shadow-popover",
            "overflow-hidden",
          )}
        >
          {previewLoading && previewResults.length === 0 ? (
            <div className="px-3 py-4 text-xs text-text-tertiary font-mono text-center">
              Searching…
            </div>
          ) : previewResults.length === 0 ? (
            <div className="px-3 py-4 text-xs text-text-tertiary font-mono text-center">
              No matches for &ldquo;{value.trim()}&rdquo;
            </div>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto">
              {previewResults.map((repo, i) => (
                <li key={repo.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === highlight}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => gotoRepo(repo)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-left",
                      "transition-colors",
                      i === highlight
                        ? "bg-bg-tertiary"
                        : "hover:bg-bg-tertiary/60",
                    )}
                  >
                    <img
                      src={repo.ownerAvatarUrl}
                      alt=""
                      width={20}
                      height={20}
                      loading="lazy"
                      className="size-5 shrink-0 rounded-full border border-border-primary bg-bg-tertiary"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">
                      {repo.fullName}
                    </span>
                    {repo.language && (
                      <span className="hidden sm:inline text-[10px] font-mono text-text-tertiary whitespace-nowrap">
                        {repo.language}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono text-text-tertiary tabular-nums whitespace-nowrap">
                      <Star
                        size={10}
                        className="text-warning"
                        fill="currentColor"
                        aria-hidden
                      />
                      {formatNumber(repo.stars)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border-primary px-3 py-1.5 text-[10px] font-mono text-text-muted flex items-center justify-between">
            <span>↑↓ to navigate · ↵ to open</span>
            <button
              type="button"
              onClick={() => {
                const q = value.trim();
                if (q) {
                  router.push(`${ROUTES.SEARCH}?q=${encodeURIComponent(q)}`);
                  setPreviewOpen(false);
                }
              }}
              className="text-text-tertiary hover:text-text-primary transition-colors"
            >
              See all results →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
