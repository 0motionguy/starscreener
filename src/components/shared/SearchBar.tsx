"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";
import { captureFunnelStep } from "@/lib/analytics/funnel";
import type { Repo } from "@/lib/types";
import { Input } from "@/components/ui/Input";
import type { SearchPreviewPortalProps } from "./SearchPreviewPortal";

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

const SearchPreviewPortal = dynamic<SearchPreviewPortalProps>(
  () =>
    import("./SearchPreviewPortal").then((m) => ({
      default: m.SearchPreviewPortal,
    })),
  { ssr: false },
);

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
  // Anchor rect of the input — the dropdown is rendered through a Portal
  // attached to document.body so it escapes the sticky header's stacking
  // context (z-30 + backdrop-blur). Without the Portal, bubble-map SVG
  // layers further down the page were painting over the dropdown.
  const [anchorRect, setAnchorRect] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const recomputeAnchor = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAnchorRect({
      left: rect.left,
      top: rect.bottom + 4,
      width: rect.width,
    });
  }, []);

  // Keep the portal dropdown glued under the input on scroll/resize.
  useEffect(() => {
    if (!previewOpen) return;
    recomputeAnchor();
    const onUpdate = () => recomputeAnchor();
    window.addEventListener("scroll", onUpdate, true);
    window.addEventListener("resize", onUpdate);
    return () => {
      window.removeEventListener("scroll", onUpdate, true);
      window.removeEventListener("resize", onUpdate);
    };
  }, [previewOpen, recomputeAnchor]);

  // Cleanup debounce + in-flight fetch on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Click-outside closes the preview dropdown. The dropdown is rendered
  // through a Portal to document.body so it lives OUTSIDE containerRef —
  // clicks on it must NOT close the preview, otherwise React unmounts the
  // listbox between mousedown and click and the row's onClick never fires
  // (the bug that made search results un-clickable).
  useEffect(() => {
    if (!previewOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest("#search-preview")
      ) {
        return;
      }
      setPreviewOpen(false);
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
      // AGN-848 — funnel "search_result_select" step. Operator picked a
      // repo from the autocomplete dropdown instead of submitting to
      // /search; record the conversion for the discover-repo funnel.
      captureFunnelStep({
        step: "search_result_select",
        flow: "discover-repo",
        repo: repo.fullName,
      });
      router.push(`/repo/${repo.owner}/${repo.name}`);
      setPreviewOpen(false);
      setValue("");
      inputRef.current?.blur();
    },
    [router],
  );

  const handleSeeAll = useCallback(() => {
    const q = value.trim();
    if (!q) return;
    // AGN-848 — funnel step "search_query" (alternate trigger via the
    // autocomplete footer button).
    captureFunnelStep({
      step: "search_query",
      flow: "discover-repo",
      query_length: q.length,
      source: "see_all_results",
    });
    router.push(`${ROUTES.SEARCH}?q=${encodeURIComponent(q)}`);
    setPreviewOpen(false);
  }, [router, value]);

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
          // AGN-848 — funnel step "search_query". Fired on the explicit
          // submit (Enter), not on every keystroke, so the count maps 1:1
          // to "operator decided to search this term".
          captureFunnelStep({
            step: "search_query",
            flow: "discover-repo",
            query_length: q.length,
            source: "enter_key",
          });
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
      <Input
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
        // AGN-615: tag every SearchBar so the global "/" shortcut can
        // find one to focus. The header SearchBar is the canonical
        // target on most routes; on /search itself the in-page bar gets
        // focus instead — querySelector returns the first match in DOM
        // order which lines up with that expectation.
        data-global-search="true"
        aria-label={placeholder}
        role={showPreview ? "combobox" : undefined}
        aria-expanded={showPreview ? previewOpen : undefined}
        aria-controls={showPreview ? "search-preview" : undefined}
        aria-autocomplete={showPreview ? "list" : undefined}
        wrapperClassName="search"
        leftIcon={<Search className="size-3.5" />}
        rightSlot={
          value ? (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear search"
              className="ds-input-clear"
            >
              <X className="size-3.5" />
            </button>
          ) : null
        }
      />

      {showPreview &&
        previewOpen &&
        mounted &&
        anchorRect && (
          <SearchPreviewPortal
            anchorRect={anchorRect}
            value={value}
            previewLoading={previewLoading}
            previewResults={previewResults}
            highlight={highlight}
            onHighlight={setHighlight}
            onSelect={gotoRepo}
            onSeeAll={handleSeeAll}
          />
        )}
    </div>
  );
}
