"use client";

// CompareSearchPicker — visible autocomplete search at the top of the
// /tools/compare page. Owns the canonical "add a repo to the matrix" UX.
//
// Live-searches `/api/search?q=...` (debounced ~180ms), renders a dropdown
// of matches (logo + owner/name + stars + language), and on selection
// navigates to `/tools/compare?repos=<existing>,<new>` so the URL stays the
// single source of truth (the server page reads `?repos=`).
//
// Keyboard: ↑ / ↓ to move through results, Enter to add the focused one,
// Esc to close the dropdown, Cmd/Ctrl+K to focus from anywhere on the
// page. Slash key also focuses.
//
// Empty / placeholder state: when there are no selected repos yet, the
// picker renders as the hero element (taller, with a callout). When repos
// are already in the matrix, it sits compact above the chip strip.

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { Icon } from "@/lib/icons";
import { useCompareStore } from "@/lib/store";

interface SearchHit {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  stars: number;
  language: string | null;
  description: string | null;
  ownerAvatarUrl: string | null;
}

interface CompareSearchPickerProps {
  /** owner/name list currently in `?repos=...`. */
  selectedFullNames: string[];
  /** Hard cap on repos in the matrix. */
  maxRepos: number;
  /** Layout intent: `hero` for empty state, `compact` once repos exist. */
  variant?: "hero" | "compact";
}

const DEBOUNCE_MS = 180;
const MIN_QUERY = 2;
const MAX_RESULTS = 8;

export function CompareSearchPicker({
  selectedFullNames,
  maxRepos,
  variant = "compact",
}: CompareSearchPickerProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const addRepo = useCompareStore((s) => s.addRepo);

  const selectedLower = useMemo(
    () => new Set(selectedFullNames.map((n) => n.toLowerCase())),
    [selectedFullNames],
  );

  const isFull = selectedFullNames.length >= maxRepos;
  const remaining = Math.max(0, maxRepos - selectedFullNames.length);

  // ---- Live search ------------------------------------------------------
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(async () => {
      try {
        const url = new URL("/api/search", window.location.origin);
        url.searchParams.set("q", q);
        url.searchParams.set("limit", String(MAX_RESULTS * 2));
        const res = await fetch(url.toString(), {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          results?: Array<{
            id?: string;
            fullName?: string;
            owner?: string;
            name?: string;
            stars?: number;
            language?: string | null;
            description?: string | null;
            ownerAvatarUrl?: string | null;
          }>;
        };

        if (cancelled) return;

        const hits: SearchHit[] = (body.results ?? [])
          .filter((r): r is Required<Pick<typeof r, "fullName" | "owner" | "name">> & typeof r =>
            typeof r.fullName === "string" &&
            typeof r.owner === "string" &&
            typeof r.name === "string",
          )
          .map((r) => ({
            id: r.id ?? `${r.owner}--${r.name}`,
            fullName: r.fullName,
            owner: r.owner,
            name: r.name,
            stars: typeof r.stars === "number" ? r.stars : 0,
            language: r.language ?? null,
            description: r.description ?? null,
            ownerAvatarUrl: r.ownerAvatarUrl ?? null,
          }))
          .slice(0, MAX_RESULTS);

        setResults(hits);
        setActiveIdx(hits.length > 0 ? 0 : -1);
      } catch (err) {
        if (cancelled) return;
        console.error("[CompareSearchPicker] search failed", err);
        setError("Search is offline — try again");
        setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  // ---- Outside-click closes dropdown -----------------------------------
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // ---- Cmd/Ctrl+K + "/" global focus shortcut --------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (e.key === "/" && !isTyping) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- Focus event from "Add repo" chip --------------------------------
  useEffect(() => {
    function onFocusReq() {
      inputRef.current?.focus();
      inputRef.current?.select();
      setOpen(true);
    }
    window.addEventListener("compare:focus-search", onFocusReq);
    return () => window.removeEventListener("compare:focus-search", onFocusReq);
  }, []);

  // ---- Add a hit to the comparison -------------------------------------
  const addHit = useCallback(
    (hit: SearchHit) => {
      if (isFull) return;
      if (selectedLower.has(hit.fullName.toLowerCase())) {
        // Already selected — clear input, keep focus, close dropdown
        setQuery("");
        setOpen(false);
        return;
      }
      const next = [...selectedFullNames, hit.fullName];
      // Keep the global Zustand tray in sync so other surfaces reflect the
      // pick immediately.
      addRepo(hit.id, hit.fullName);
      const href = `/tools/compare?repos=${next.map(encodeURIComponent).join(",")}`;
      setQuery("");
      setResults([]);
      setOpen(false);
      router.push(href, { scroll: false });
    },
    [addRepo, isFull, router, selectedFullNames, selectedLower],
  );

  // ---- Keyboard navigation ---------------------------------------------
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActiveIdx((i) => (results.length === 0 ? -1 : (i + 1) % results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) =>
        results.length === 0 ? -1 : (i - 1 + results.length) % results.length,
      );
    } else if (e.key === "Enter") {
      if (activeIdx >= 0 && activeIdx < results.length) {
        e.preventDefault();
        addHit(results[activeIdx]);
      } else if (results.length === 1) {
        e.preventDefault();
        addHit(results[0]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showDropdown =
    open &&
    (loading || results.length > 0 || error !== null || query.trim().length >= MIN_QUERY);

  const heroMode = variant === "hero";

  return (
    <section
      ref={wrapRef}
      className={`cmp-pick ${heroMode ? "is-hero" : "is-compact"}`}
      aria-label="Find and add a repository to the comparison"
    >
      {heroMode ? (
        <div className="cmp-pick-eyebrow">
          <span className="cmp-pick-eyebrow-num">{"// SEARCH"}</span>
          <span className="cmp-pick-eyebrow-title">Find any tracked repo</span>
          <span className="cmp-pick-eyebrow-meta">
            ⌘K · / · ↑↓ · ↵ to add
          </span>
        </div>
      ) : null}

      <div
        className={`cmp-pick-field ${showDropdown ? "is-open" : ""} ${isFull ? "is-full" : ""}`}
      >
        <span className="cmp-pick-icon" aria-hidden="true">
          <Icon name="search" size="sm" />
        </span>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          className="cmp-pick-input"
          placeholder={
            isFull
              ? `Comparison full — remove a repo first (${maxRepos}/${maxRepos})`
              : heroMode
                ? `Search 2,000+ tracked repos — e.g. "vercel/next.js", "anthropic/claude", "react"`
                : `Add another repo · ${remaining} slot${remaining === 1 ? "" : "s"} left`
          }
          aria-label="Search repositories"
          aria-controls={listboxId}
          aria-haspopup="listbox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIdx >= 0 && activeIdx < results.length
              ? `${listboxId}-opt-${activeIdx}`
              : undefined
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          disabled={isFull}
        />
        {query.length > 0 ? (
          <button
            type="button"
            className="cmp-pick-clear"
            onClick={() => {
              setQuery("");
              setResults([]);
              setActiveIdx(-1);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            title="Clear"
          >
            <Icon name="close" size="sm" />
          </button>
        ) : (
          <kbd className="cmp-pick-kbd" aria-hidden="true">⌘K</kbd>
        )}
      </div>

      {showDropdown ? (
        <div
          className="cmp-pick-pop"
          id={listboxId}
          role="listbox"
          aria-label="Search results"
        >
          {loading ? (
            <div className="cmp-pick-state">Searching…</div>
          ) : error ? (
            <div className="cmp-pick-state cmp-pick-state-err">{error}</div>
          ) : results.length === 0 ? (
            <div className="cmp-pick-state">
              No matches for <b>{query.trim()}</b> · try an owner or repo name
            </div>
          ) : (
            <ul className="cmp-pick-list">
              {results.map((hit, i) => {
                const already = selectedLower.has(hit.fullName.toLowerCase());
                return (
                  <li key={hit.fullName}>
                    <button
                      id={`${listboxId}-opt-${i}`}
                      type="button"
                      role="option"
                      aria-selected={i === activeIdx}
                      className={`cmp-pick-row ${i === activeIdx ? "is-active" : ""} ${already ? "is-already" : ""}`}
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => addHit(hit)}
                      disabled={already || isFull}
                      title={
                        already
                          ? "Already in comparison"
                          : isFull
                            ? "Comparison full"
                            : `Add ${hit.fullName}`
                      }
                    >
                      <span className="cmp-pick-row-avatar" aria-hidden="true">
                        {hit.ownerAvatarUrl ? (
                          <Image
                            src={hit.ownerAvatarUrl}
                            alt=""
                            width={22}
                            height={22}
                            unoptimized
                            style={{ borderRadius: 3, display: "block" }}
                          />
                        ) : (
                          <span className="cmp-pick-row-mono">
                            {hit.owner.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="cmp-pick-row-name">
                        <span className="cmp-pick-row-owner">{hit.owner}/</span>
                        <span className="cmp-pick-row-repo">{hit.name}</span>
                      </span>
                      {hit.language ? (
                        <span className="cmp-pick-row-lang">{hit.language}</span>
                      ) : null}
                      <span className="cmp-pick-row-stars" aria-label="stars">
                        ★ {formatCompact(hit.stars)}
                      </span>
                      <span className="cmp-pick-row-cta">
                        {already ? (
                          <>
                            <Icon name="check" size="sm" /> In matrix
                          </>
                        ) : (
                          <>
                            <Icon name="plus" size="sm" /> Add
                          </>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="cmp-pick-foot">
            <span>↑↓ navigate</span>
            <span>↵ add</span>
            <span>esc close</span>
            <span className="cmp-pick-foot-right">
              {selectedFullNames.length}/{maxRepos} in matrix
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatCompact(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}
