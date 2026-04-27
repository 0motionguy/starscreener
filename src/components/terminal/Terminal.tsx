"use client";

// StarScreener — Terminal orchestrator
//
// Consumes an already-filtered+sorted repo list and renders the full
// dense table (or a mobile card stack on small viewports). Manages:
//   - breakpoint-aware column visibility
//   - keyboard focus + key bindings (arrows, W, C, Enter, Esc)
//   - the column picker popover open state
//   - first-paint row cap (DEFAULT_VISIBLE_ROWS) with a "Show all" CTA
//     so cold-load renders 150 rows instead of 800. Keyboard arrow-down
//     past the cap auto-expands so navigation isn't blocked.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown } from "lucide-react";

import type { Breakpoint, Column } from "./columns";
import { COLUMNS_BY_ID } from "./columns";
import { ColumnPicker } from "./ColumnPicker";
import { TerminalEmpty } from "./TerminalEmpty";
import { TerminalHeader } from "./TerminalHeader";
import { TerminalMobileCard } from "./TerminalMobileCard";
import { TerminalRow } from "./TerminalRow";
import { TerminalBar } from "@/components/v2/TerminalBar";

import type { ColumnId, Repo, SortDirection } from "@/lib/types";
import { getEffectiveSortColumn } from "@/lib/filters";
import { cn } from "@/lib/utils";
import {
  useCompareStore,
  useFilterStore,
  useWatchlistStore,
} from "@/lib/store";
import {
  toastCompareAdded,
  toastCompareFull,
  toastCompareRemoved,
  toastWatchAdded,
  toastWatchRemoved,
} from "@/lib/toast";
import { KeyboardHelp } from "./KeyboardHelp";

interface TerminalProps {
  repos: Repo[];
  emptyMessage?: string;
  emptyCta?: { label: string; href: string };
  rowActions?: ("remove" | "compare" | "watch")[];
  className?: string;
  virtualized?: boolean;
  sortOverride?: { column: ColumnId; direction: SortDirection };
}

// Tailwind-aligned min widths (px). Matches default Tailwind v4 screens.
const BP_PX: Record<Breakpoint, number> = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

/**
 * First-paint row cap. 800-row un-virtualized tables tank TTI — rendering
 * 150 rows cuts DOM node count by ~80% while still covering the top of
 * every common sort preset. Users hit "Show all" (or arrow-down past the
 * cap) to opt into the full list.
 */
const DEFAULT_VISIBLE_ROWS = 150;

function bpPasses(current: number, minBp: Breakpoint): boolean {
  return current >= BP_PX[minBp];
}

/** Lightweight window-width hook (SSR-safe). */
function useWindowWidth(): number {
  const [w, setW] = useState<number>(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    // rAF-coalesce so a continuous drag-resize fires at most one setW per
    // animation frame (~60Hz) instead of every browser resize event
    // (often 120+/s on high-refresh displays).
    let raf = 0;
    const onResize = () => {
      if (raf !== 0) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        setW(window.innerWidth);
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      if (raf !== 0) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return w;
}

export function Terminal({
  repos,
  emptyMessage,
  emptyCta,
  className,
  virtualized = false,
  sortOverride,
}: TerminalProps) {
  const router = useRouter();

  // Filter-store selectors
  const density = useFilterStore((s) => s.density);
  const storedVisible = useFilterStore((s) => s.visibleColumns);
  const sortColumn = useFilterStore((s) => s.sortColumn);
  const sortDirection = useFilterStore((s) => s.sortDirection);
  const activeTab = useFilterStore((s) => s.activeTab);
  const timeRange = useFilterStore((s) => s.timeRange);
  const setSort = useFilterStore((s) => s.setSort);

  // Watch/compare actions for keyboard shortcuts
  const toggleWatch = useWatchlistStore((s) => s.toggleWatch);
  const addCompare = useCompareStore((s) => s.addRepo);
  const removeCompare = useCompareStore((s) => s.removeRepo);
  const compareRepos = useCompareStore((s) => s.repos);

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;

  // Track: effective sort state tri-state (column + direction) for header UI.
  const effectiveSortColumn: ColumnId | null = sortOverride
    ? sortOverride.column
    : getEffectiveSortColumn(sortColumn, activeTab, timeRange);
  const effectiveSortDirection: SortDirection | null = sortOverride
    ? sortOverride.direction
    : sortDirection;

  // Breakpoint-aware column visibility
  const visibleColumns: Column[] = useMemo(() => {
    const kept: Column[] = [];
    for (const id of storedVisible) {
      const col = COLUMNS_BY_ID[id];
      if (!col) continue;
      if (!bpPasses(windowWidth, col.minBreakpoint)) continue;
      kept.push(col);
    }
    return kept;
  }, [storedVisible, windowWidth]);

  // Row cap state — reset whenever the source list changes (sort, filter,
  // category switch) so the user always starts from the top N of the fresh
  // view. `virtualized` prop opts out of the cap entirely.
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    setShowAll(false);
  }, [repos]);
  const totalRows = repos.length;
  const effectiveLimit =
    virtualized || showAll || totalRows <= DEFAULT_VISIBLE_ROWS
      ? totalRows
      : DEFAULT_VISIBLE_ROWS;
  const hiddenRowCount = totalRows - effectiveLimit;

  // Keyboard focus state
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const openColumnPicker = useCallback(() => setPickerOpen(true), []);
  const closeColumnPicker = useCallback(() => setPickerOpen(false), []);

  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  const onSort = useCallback(
    (id: ColumnId) => {
      if (sortOverride) return;
      const col = COLUMNS_BY_ID[id];
      if (!col || !col.sortable) return;

      // Cycle: if this column isn't active → start "desc".
      // If active + "desc" → switch to "asc".
      // If active + "asc" → revert to default (momentum desc).
      if (effectiveSortColumn !== id) {
        setSort(id, "desc");
      } else if (effectiveSortDirection === "desc") {
        setSort(id, "asc");
      } else {
        setSort("momentum", "desc");
      }
    },
    [effectiveSortColumn, effectiveSortDirection, setSort, sortOverride],
  );

  // Navigate shortcut for Enter
  const openRepo = useCallback(
    (repo: Repo) => router.push(`/repo/${repo.owner}/${repo.name}`),
    [router],
  );

  // Keyboard handlers — registered once, reading current focus via state
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack when focus is inside a field, button, or dialog
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target as HTMLElement | null)?.isContentEditable;
      if (inField) return;

      // ? opens help anytime (unless modifier pressed)
      if (
        (e.key === "?" || (e.shiftKey && e.key === "/")) &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        if (helpOpen) return;
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (helpOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          setHelpOpen(false);
        }
        return;
      }

      if (repos.length === 0) return;
      if (pickerOpen && e.key !== "Escape") return;

      const lastIdx = repos.length - 1;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((i) => {
            const next = i === null ? 0 : Math.min(lastIdx, i + 1);
            // Auto-expand the row cap once the user arrows past it so
            // keyboard nav never hits an invisible wall.
            if (next >= effectiveLimit - 1 && hiddenRowCount > 0) {
              setShowAll(true);
            }
            return next;
          });
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((i) => (i === null ? 0 : Math.max(0, i - 1)));
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case "End":
          e.preventDefault();
          setFocusedIndex(lastIdx);
          break;
        case "PageDown":
          e.preventDefault();
          setFocusedIndex((i) =>
            i === null ? Math.min(lastIdx, 9) : Math.min(lastIdx, i + 10),
          );
          break;
        case "PageUp":
          e.preventDefault();
          setFocusedIndex((i) => (i === null ? 0 : Math.max(0, i - 10)));
          break;
        case "Enter": {
          if (focusedIndex === null) return;
          const r = repos[focusedIndex];
          if (r) openRepo(r);
          break;
        }
        case "w":
        case "W": {
          if (focusedIndex === null) return;
          const r = repos[focusedIndex];
          if (!r) return;
          const wasWatched = useWatchlistStore.getState().isWatched(r.id);
          toggleWatch(r.id, r.stars);
          if (wasWatched) toastWatchRemoved(r.fullName);
          else toastWatchAdded(r.fullName);
          break;
        }
        case "c":
        case "C": {
          if (focusedIndex === null) return;
          const r = repos[focusedIndex];
          if (!r) return;
          const compareState = useCompareStore.getState();
          if (compareState.isComparing(r.id)) {
            removeCompare(r.id);
            toastCompareRemoved(
              useCompareStore.getState().repos.length,
            );
            break;
          }
          if (compareState.isFull()) {
            toastCompareFull();
            break;
          }
          addCompare(r.id);
          toastCompareAdded(useCompareStore.getState().repos.length);
          break;
        }
        case "Escape":
          if (pickerOpen) closeColumnPicker();
          else setFocusedIndex(null);
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    repos,
    focusedIndex,
    openRepo,
    toggleWatch,
    addCompare,
    removeCompare,
    compareRepos,
    pickerOpen,
    closeColumnPicker,
    helpOpen,
    effectiveLimit,
    hiddenRowCount,
  ]);

  // Mobile expand state — single-expanded policy keeps the viewport sane.
  const [expandedMobileId, setExpandedMobileId] = useState<string | null>(null);

  // ---------------- Empty state ----------------
  if (repos.length === 0) {
    return (
      <>
        <TerminalEmpty
          message={emptyMessage}
          cta={emptyCta}
          className={className}
        />
        {helpOpen ? <KeyboardHelp onClose={closeHelp} /> : null}
      </>
    );
  }

  // ---------------- Mobile layout ----------------
  if (isMobile) {
    const mobileVisible = repos.slice(0, effectiveLimit);
    return (
      <>
        <div className={cn("space-y-2", className)}>
          {mobileVisible.map((repo, i) => (
            <TerminalMobileCard
              key={repo.id}
              repo={repo}
              displayRank={i + 1}
              expanded={expandedMobileId === repo.id}
              onToggleExpand={() =>
                setExpandedMobileId((current) =>
                  current === repo.id ? null : repo.id,
                )
              }
            />
          ))}
          {hiddenRowCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="v2-btn v2-btn-ghost w-full"
            >
              SHOW ALL {totalRows.toLocaleString("en-US")} REPOS
              <span
                className="ml-2"
                style={{ color: "var(--v2-ink-400)" }}
              >
                (+{hiddenRowCount.toLocaleString("en-US")} MORE)
              </span>
            </button>
          )}
        </div>
        {helpOpen ? <KeyboardHelp onClose={closeHelp} /> : null}
      </>
    );
  }

  // ---------------- Desktop table ----------------
  const visibleRows = repos.slice(0, effectiveLimit).length;
  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          "v2-card relative w-full overflow-hidden",
          className,
        )}
      >
        <TerminalBar
          label={`// REPOS · LIVE · ${visibleRows.toLocaleString("en-US")} ROWS`}
          status={`EU-CENTRAL-1 · ${repos.length.toLocaleString("en-US")} TRACKED`}
          live
        />
        <div className="overflow-x-auto">
          <table
            role="grid"
            aria-rowcount={repos.length}
            // table-layout: fixed so explicit per-column widths are honored
            // strictly. Prevents the repo (name) cell from bloating with
            // slack and pushing the stats cluster away from the name.
            style={{ tableLayout: "fixed", width: "100%" }}
            className="border-separate border-spacing-0"
          >
            <TerminalHeader
              visibleColumns={visibleColumns}
              sortColumn={effectiveSortColumn}
              sortDirection={effectiveSortDirection}
              onSort={onSort}
              onOpenColumnPicker={openColumnPicker}
              disableSort={Boolean(sortOverride)}
            />
            <tbody>
              {repos.slice(0, effectiveLimit).map((repo, i) => (
                <TerminalRow
                  key={repo.id}
                  repo={repo}
                  displayRank={i + 1}
                  visibleColumns={visibleColumns}
                  density={density}
                  focused={focusedIndex === i}
                  index={i}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer ticker — V2 motif. Mono uppercase, hairline border-top. */}
        <div
          className="flex items-center justify-between px-3 py-2 v2-mono text-[10px]"
          style={{
            borderTop: "1px solid var(--v2-line-100)",
            background: "var(--v2-bg-050)",
            color: "var(--v2-ink-400)",
          }}
        >
          <span>
            <span aria-hidden>{"// "}</span>
            SHOWING{" "}
            <span
              className="tabular-nums"
              style={{ color: "var(--v2-ink-100)" }}
            >
              {visibleRows.toLocaleString("en-US")}
            </span>{" "}
            OF{" "}
            <span
              className="tabular-nums"
              style={{ color: "var(--v2-ink-100)" }}
            >
              {totalRows.toLocaleString("en-US")}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowUpDown size={10} aria-hidden className="shrink-0" />
            <span>
              SORT{" "}
              <span style={{ color: "var(--v2-ink-100)" }}>
                {effectiveSortColumn ? effectiveSortColumn.toUpperCase() : "—"}
              </span>{" "}
              {effectiveSortDirection === "asc" ? "ASC" : "DESC"}
            </span>
          </span>
        </div>

        {pickerOpen ? <ColumnPicker onClose={closeColumnPicker} /> : null}
      </div>

      {hiddenRowCount > 0 && (
        <div className="mt-3 flex items-center justify-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="v2-btn v2-btn-ghost"
            style={{ height: 36 }}
            title="Load the full sorted list — may briefly increase CPU on slower devices."
          >
            <span style={{ color: "var(--v2-ink-300)" }}>
              <span aria-hidden>{"// "}</span>
              SHOWING{" "}
              <span
                className="tabular-nums"
                style={{ color: "var(--v2-ink-100)" }}
              >
                {effectiveLimit.toLocaleString("en-US")}
              </span>
              /
              <span
                className="tabular-nums"
                style={{ color: "var(--v2-ink-100)" }}
              >
                {totalRows.toLocaleString("en-US")}
              </span>
            </span>
            <span
              className="mx-2"
              aria-hidden
              style={{ color: "var(--v2-ink-500)" }}
            >
              ·
            </span>
            <span style={{ color: "var(--v2-acc)" }}>
              SHOW ALL {totalRows.toLocaleString("en-US")}
            </span>
          </button>
        </div>
      )}
      {helpOpen ? <KeyboardHelp onClose={closeHelp} /> : null}
    </>
  );
}
