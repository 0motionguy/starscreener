"use client";

// Navigator — the ⌘K command palette.
//
// Deterministic tier (N0): fuzzy-matches the nav registry
// (src/lib/navigator/actions.ts) for instant destination jumps, plus an
// async repo search against the same /api/search endpoint the header
// SearchBar uses, plus an always-present "search everything" fallback so
// Enter always resolves to something.
//
// Design: mirrors the house dialog vocabulary from GlobalKeyboardHelp —
// overlay scrim token, v2-card panel, sharp corners, hairline dividers,
// mono kbd chips. Anchored near the top (not centred) so results grow
// downward. Selection is keyed by a 2px functional-green left rail (a
// functional selection indicator, per DESIGN.md — not a decorative
// side-stripe) plus a raised row background.
//
// Portal-rendered to document.body to escape the sticky header's
// stacking + backdrop-blur context (same fix the SearchBar preview uses).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { matchNavCommands, type NavCommand } from "@/lib/navigator/actions";
import type { Repo } from "@/lib/types";

const REPO_MIN_CHARS = 2;
const REPO_LIMIT = 6;
const DEBOUNCE_MS = 180;

type Item =
  | { kind: "nav"; cmd: NavCommand }
  | { kind: "repo"; repo: Repo }
  | { kind: "search"; query: string };

function ghAvatar(owner: string): string {
  return `https://github.com/${owner}.png?size=40`;
}

function track(event: string, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  // posthog-js attaches to window.posthog when loaded; optional so a
  // blocked/absent analytics bundle never breaks navigation.
  (window as unknown as { posthog?: { capture?: (e: string, p?: unknown) => void } })
    .posthog?.capture?.(event, props);
}

export function NavigatorPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    track("navigator_open");
    inputRef.current?.focus();
  }, []);

  // Async repo search — debounced + abortable, mirrors SearchBar.fetchPreview.
  useEffect(() => {
    const q = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < REPO_MIN_CHARS) {
      setRepos([]);
      setLoading(false);
      if (abortRef.current) abortRef.current.abort();
      return;
    }
    debounceRef.current = setTimeout(() => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(q)}&limit=${REPO_LIMIT}`, {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
        .then((data: { results?: Repo[] }) => {
          setRepos(Array.isArray(data.results) ? data.results : []);
        })
        .catch((err: unknown) => {
          if ((err as { name?: string }).name === "AbortError") return;
          setRepos([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const navMatches = useMemo(() => matchNavCommands(query), [query]);

  // Flat item list drives keyboard nav: nav → repos → the search fallback.
  const items = useMemo<Item[]>(() => {
    const list: Item[] = navMatches.map((cmd) => ({ kind: "nav", cmd }));
    for (const repo of repos) list.push({ kind: "repo", repo });
    const q = query.trim();
    if (q.length >= 1) list.push({ kind: "search", query: q });
    return list;
  }, [navMatches, repos, query]);

  // Keep highlight in range whenever the result set changes.
  useEffect(() => {
    setHighlight((h) => (items.length === 0 ? 0 : Math.min(h, items.length - 1)));
  }, [items.length]);

  const execute = useCallback(
    (item: Item | undefined) => {
      if (!item) return;
      if (item.kind === "nav") {
        track("navigator_select", { kind: "nav", id: item.cmd.id });
        router.push(item.cmd.href);
      } else if (item.kind === "repo") {
        track("navigator_select", { kind: "repo", repo: item.repo.fullName });
        router.push(`/repo/${item.repo.owner}/${item.repo.name}`);
      } else {
        track("navigator_select", { kind: "search" });
        router.push(`/search?q=${encodeURIComponent(item.query)}`);
      }
      onClose();
    },
    [router, onClose],
  );

  // Dialog-level keys: Esc closes, arrows move, Enter executes. Typing is
  // handled by the input's onChange; these run at the panel so the input
  // keeps focus throughout.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (items.length ? (h + 1) % items.length : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (items.length ? (h <= 0 ? items.length - 1 : h - 1) : 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        execute(items[highlight]);
      }
    },
    [items, highlight, execute, onClose],
  );

  // Close on scrim click (but not clicks inside the panel).
  const onScrimDown = useCallback(
    (e: React.MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    },
    [onClose],
  );

  // Scroll the highlighted row into view on keyboard nav.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-nav-idx="${highlight}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  if (typeof document === "undefined") return null;

  let idx = -1;
  const showNavHeader = navMatches.length > 0;
  const showRepoHeader = repos.length > 0;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Navigator command menu"
      onMouseDown={onScrimDown}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex items-start justify-center bg-bg-overlay px-4 pt-[12vh] animate-fade-in"
    >
      <div
        ref={panelRef}
        className={cn(
          "w-full max-w-xl overflow-hidden v2-card",
          "shadow-[var(--shadow-overlay)] animate-slide-up",
        )}
      >
        {/* Query row */}
        <div className="flex items-center gap-2.5 border-b border-border-secondary px-3.5">
          <Search size={15} strokeWidth={2} className="shrink-0 text-accent" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            placeholder="Jump to a page, find a repo…"
            aria-label="Navigator search"
            autoComplete="off"
            spellCheck={false}
            className={cn(
              "h-12 flex-1 bg-transparent font-display text-[15px] text-text-primary",
              "placeholder:text-text-tertiary focus:outline-none",
            )}
          />
          <kbd
            className={cn(
              "hidden shrink-0 items-center rounded border border-border-strong bg-bg-secondary",
              "px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary sm:inline-flex",
            )}
          >
            esc
          </kbd>
        </div>

        {/* Loading rail — only while a repo fetch is in flight. */}
        <div className="h-0.5 overflow-hidden" aria-hidden="true">
          {loading && <div className="h-full w-full animate-pulse bg-accent/70" />}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[min(58vh,420px)] overflow-y-auto py-1.5">
          {showNavHeader && <div className="label-section px-3.5 pb-1 pt-1.5">Go to</div>}
          {navMatches.map((cmd) => {
            idx += 1;
            const active = idx === highlight;
            const rowIdx = idx;
            return (
              <button
                key={`nav-${cmd.id}`}
                type="button"
                data-nav-idx={rowIdx}
                onMouseMove={() => setHighlight(rowIdx)}
                onClick={() => execute({ kind: "nav", cmd })}
                className={cn(
                  "relative flex w-full items-center gap-3 px-3.5 py-2 text-left text-[13px] transition-colors",
                  active ? "bg-bg-muted text-text-primary" : "text-text-secondary",
                )}
              >
                {active && (
                  <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-success" aria-hidden="true" />
                )}
                <span className="flex-1 truncate">{cmd.label}</span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-text-tertiary">
                  {cmd.section}
                </span>
                {active && (
                  <CornerDownLeft size={12} strokeWidth={2} className="shrink-0 text-text-tertiary" aria-hidden="true" />
                )}
              </button>
            );
          })}

          {showRepoHeader && <div className="label-section px-3.5 pb-1 pt-2.5">Repos</div>}
          {repos.map((repo) => {
            idx += 1;
            const active = idx === highlight;
            const rowIdx = idx;
            return (
              <button
                key={`repo-${repo.fullName}`}
                type="button"
                data-nav-idx={rowIdx}
                onMouseMove={() => setHighlight(rowIdx)}
                onClick={() => execute({ kind: "repo", repo })}
                className={cn(
                  "relative flex w-full items-center gap-3 px-3.5 py-2 text-left text-[13px] transition-colors",
                  active ? "bg-bg-muted text-text-primary" : "text-text-secondary",
                )}
              >
                {active && (
                  <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-success" aria-hidden="true" />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ghAvatar(repo.owner)}
                  alt=""
                  loading="lazy"
                  width={18}
                  height={18}
                  className="size-[18px] shrink-0 rounded-sm border border-border-secondary bg-bg-secondary"
                />
                <span className="flex-1 truncate">
                  <span className="text-text-tertiary">{repo.owner}/</span>
                  <span className={active ? "text-text-primary" : "text-text-secondary"}>{repo.name}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-text-tertiary">repo</span>
              </button>
            );
          })}

          {/* Always-present search fallback — Enter never dead-ends. */}
          {query.trim().length >= 1 &&
            (() => {
              idx += 1;
              const active = idx === highlight;
              const rowIdx = idx;
              return (
                <button
                  type="button"
                  data-nav-idx={rowIdx}
                  onMouseMove={() => setHighlight(rowIdx)}
                  onClick={() => execute({ kind: "search", query: query.trim() })}
                  className={cn(
                    "relative mt-1 flex w-full items-center gap-3 border-t border-border-secondary px-3.5 py-2.5 text-left text-[13px] transition-colors",
                    active ? "bg-bg-muted text-text-primary" : "text-text-secondary",
                  )}
                >
                  {active && (
                    <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-success" aria-hidden="true" />
                  )}
                  <Search size={14} strokeWidth={2} className="shrink-0 text-text-tertiary" aria-hidden="true" />
                  <span className="flex-1 truncate">
                    Search all repos for <span className="text-accent">{query.trim()}</span>
                  </span>
                </button>
              );
            })()}

          {items.length === 0 && (
            <div className="px-3.5 py-6 text-center text-[12px] text-text-tertiary">
              No matches. Keep typing to search repos.
            </div>
          )}
        </div>

        {/* Footer affordances — mirrors GlobalKeyboardHelp. */}
        <div className="flex items-center gap-4 border-t border-border-secondary px-3.5 py-2 text-[11px] text-text-tertiary">
          <span className="flex items-center gap-1">
            <NavKbd>↑</NavKbd>
            <NavKbd>↓</NavKbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <NavKbd>↵</NavKbd>
            open
          </span>
          <span className="flex items-center gap-1">
            <NavKbd>esc</NavKbd>
            close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function NavKbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[18px] items-center justify-center rounded border border-border-strong bg-bg-secondary px-1 py-0.5 font-mono text-[10px] text-text-secondary">
      {children}
    </kbd>
  );
}
