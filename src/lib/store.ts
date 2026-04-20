// StarScreener — Zustand stores

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ALL_COLUMNS,
  DEFAULT_VISIBLE_COLUMNS,
  type ColumnId,
  type Density,
  type MetaFilter,
  type SortBy,
  type SortDirection,
  type TerminalTab,
  type TimeRange,
  type WatchlistItem,
} from "./types";

// ---------------------------------------------------------------------------
// Watchlist Store — persisted to localStorage
// ---------------------------------------------------------------------------

interface WatchlistState {
  repos: WatchlistItem[];
  addRepo: (repoId: string, stars: number) => void;
  removeRepo: (repoId: string) => void;
  isWatched: (repoId: string) => boolean;
  toggleWatch: (repoId: string, stars: number) => void;
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      repos: [],

      addRepo: (repoId, stars) => {
        const { repos } = get();
        if (repos.some((r) => r.repoId === repoId)) return;
        set({
          repos: [
            ...repos,
            {
              repoId,
              addedAt: new Date().toISOString(),
              starsAtAdd: stars,
            },
          ],
        });
      },

      removeRepo: (repoId) => {
        set({ repos: get().repos.filter((r) => r.repoId !== repoId) });
      },

      isWatched: (repoId) => {
        return get().repos.some((r) => r.repoId === repoId);
      },

      toggleWatch: (repoId, stars) => {
        const { isWatched, addRepo, removeRepo } = get();
        if (isWatched(repoId)) {
          removeRepo(repoId);
        } else {
          addRepo(repoId, stars);
        }
      },
    }),
    {
      name: "starscreener-watchlist",
    },
  ),
);

// ---------------------------------------------------------------------------
// Compare Store — persisted to localStorage
// ---------------------------------------------------------------------------

interface CompareState {
  repos: string[]; // max 4 repo IDs
  addRepo: (id: string) => void;
  removeRepo: (id: string) => void;
  clearAll: () => void;
  isComparing: (id: string) => boolean;
  isFull: () => boolean;
}

export const useCompareStore = create<CompareState>()(
  persist(
    (set, get) => ({
      repos: [],

      addRepo: (id) => {
        const { repos } = get();
        if (repos.length >= 4 || repos.includes(id)) return;
        set({ repos: [...repos, id] });
      },

      removeRepo: (id) => {
        set({ repos: get().repos.filter((r) => r !== id) });
      },

      clearAll: () => {
        set({ repos: [] });
      },

      isComparing: (id) => {
        return get().repos.includes(id);
      },

      isFull: () => {
        return get().repos.length >= 4;
      },
    }),
    {
      name: "starscreener-compare",
    },
  ),
);

// ---------------------------------------------------------------------------
// Filter Store — partial persist (terminal layout prefs + filter toggles)
// ---------------------------------------------------------------------------

type ViewMode = "card" | "list";

interface FilterState {
  // Existing fields
  timeRange: TimeRange;
  sortBy: SortBy;
  category: string | null;
  viewMode: ViewMode;

  // NEW — terminal narrative filters
  activeMetaFilter: MetaFilter | null;
  activeTag: string | null; // e.g. "claude-code" — additive to metaFilter
  activeTab: TerminalTab;

  // NEW — layout prefs
  density: Density;
  visibleColumns: ColumnId[];
  sortColumn: ColumnId;
  sortDirection: SortDirection;

  // NEW — sidebar filters
  languages: string[];
  starsRange: [number, number] | null;
  minMomentum: number;
  onlyWatched: boolean;
  excludeArchived: boolean;

  // Existing actions
  setTimeRange: (range: TimeRange) => void;
  setSortBy: (sort: SortBy) => void;
  setCategory: (category: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  reset: () => void;

  // NEW actions
  setActiveMetaFilter: (m: MetaFilter | null) => void;
  setActiveTag: (t: string | null) => void;
  setActiveTab: (t: TerminalTab) => void;
  setDensity: (d: Density) => void;
  toggleColumn: (id: ColumnId) => void;
  setVisibleColumns: (ids: ColumnId[]) => void;
  resetColumnsToDefault: () => void;
  setSort: (col: ColumnId, dir: SortDirection) => void;
  toggleSortDirection: () => void;
  setLanguages: (ls: string[]) => void;
  toggleLanguage: (lang: string) => void;
  setStarsRange: (range: [number, number] | null) => void;
  setMinMomentum: (n: number) => void;
  toggleOnlyWatched: () => void;
  toggleExcludeArchived: () => void;
  resetFilters: () => void;
  resetAll: () => void;
}

// Columns that are always required — users cannot hide them.
const REQUIRED_COLUMNS: ColumnId[] = ["rank", "repo"];

// Sort preset applied when a tab is activated.
const TAB_SORT_PRESETS: Record<
  TerminalTab,
  { col: ColumnId; dir: SortDirection }
> = {
  trending: { col: "rank", dir: "asc" },
  gainers: { col: "delta24h", dir: "desc" },
  new: { col: "lastCommit", dir: "desc" },
  watchlisted: { col: "momentum", dir: "desc" },
};

// Defaults split so resetFilters / resetAll target the right subset.
const FILTER_DEFAULTS = {
  timeRange: "7d" as TimeRange,
  sortBy: "momentum" as SortBy,
  category: null as string | null,
  activeMetaFilter: null as MetaFilter | null,
  activeTag: null as string | null,
  activeTab: "trending" as TerminalTab,
  languages: [] as string[],
  starsRange: null as [number, number] | null,
  minMomentum: 0,
  onlyWatched: false,
  excludeArchived: true,
};

const LAYOUT_DEFAULTS = {
  viewMode: "card" as ViewMode,
  density: "compact" as Density,
  visibleColumns: [...DEFAULT_VISIBLE_COLUMNS] as ColumnId[],
  sortColumn: "rank" as ColumnId,
  sortDirection: "asc" as SortDirection,
};

const ALL_DEFAULTS = {
  ...FILTER_DEFAULTS,
  ...LAYOUT_DEFAULTS,
};

export const useFilterStore = create<FilterState>()(
  persist(
    (set, get) => ({
      ...ALL_DEFAULTS,

      // Existing actions -----------------------------------------------------
      setTimeRange: (timeRange) => set({ timeRange }),
      setSortBy: (sortBy) => set({ sortBy }),
      setCategory: (category) => set({ category }),
      setViewMode: (viewMode) => set({ viewMode }),
      reset: () => set(ALL_DEFAULTS),

      // New actions ----------------------------------------------------------
      setActiveMetaFilter: (m) => {
        // Setting a meta filter implicitly returns to the trending tab so the
        // filter semantics are unambiguous.
        set({ activeMetaFilter: m, activeTab: "trending" });
      },

      setActiveTag: (t) => {
        set({ activeTag: t, activeTab: "trending" });
      },

      setActiveTab: (t) => {
        const preset = TAB_SORT_PRESETS[t];
        set({
          activeTab: t,
          activeMetaFilter: null,
          sortColumn: preset.col,
          sortDirection: preset.dir,
        });
      },

      setDensity: (density) => set({ density }),

      toggleColumn: (id) => {
        // Required columns cannot be toggled off.
        if (REQUIRED_COLUMNS.includes(id)) {
          const { visibleColumns } = get();
          if (!visibleColumns.includes(id)) {
            set({ visibleColumns: [...visibleColumns, id] });
          }
          return;
        }
        const { visibleColumns } = get();
        const isVisible = visibleColumns.includes(id);
        if (isVisible) {
          // Guard: never drop below 1 visible column.
          if (visibleColumns.length <= 1) return;
          set({
            visibleColumns: visibleColumns.filter((c) => c !== id),
          });
        } else {
          set({ visibleColumns: [...visibleColumns, id] });
        }
      },

      setVisibleColumns: (ids) => {
        // Ensure required columns remain present and all ids are known.
        const known = ids.filter((id) => ALL_COLUMNS.includes(id));
        const withRequired = [...known];
        for (const req of REQUIRED_COLUMNS) {
          if (!withRequired.includes(req)) withRequired.unshift(req);
        }
        set({ visibleColumns: withRequired });
      },

      resetColumnsToDefault: () =>
        set({ visibleColumns: [...DEFAULT_VISIBLE_COLUMNS] }),

      setSort: (col, dir) => set({ sortColumn: col, sortDirection: dir }),

      toggleSortDirection: () =>
        set((s) => ({
          sortDirection: s.sortDirection === "asc" ? "desc" : "asc",
        })),

      setLanguages: (languages) => set({ languages }),

      toggleLanguage: (lang) => {
        const { languages } = get();
        set({
          languages: languages.includes(lang)
            ? languages.filter((l) => l !== lang)
            : [...languages, lang],
        });
      },

      setStarsRange: (starsRange) => set({ starsRange }),
      setMinMomentum: (minMomentum) => set({ minMomentum }),

      toggleOnlyWatched: () =>
        set((s) => ({ onlyWatched: !s.onlyWatched })),

      toggleExcludeArchived: () =>
        set((s) => ({ excludeArchived: !s.excludeArchived })),

      resetFilters: () => set({ ...FILTER_DEFAULTS }),
      resetAll: () => set({ ...ALL_DEFAULTS }),
    }),
    {
      name: "starscreener-filters",
      // v3 — tightened default visible columns (dropped momentum +
      // lastRelease from the first-impression layout). Bump forces old
      // persisted state through migrate() so users see the new defaults.
      version: 3,
      // Only persist layout preferences and sticky toggles — transient
      // narrative filters (meta, tab, time range, category, etc.) always
      // start fresh each session per spec.
      partialize: (state) => ({
        density: state.density,
        visibleColumns: state.visibleColumns,
        sortColumn: state.sortColumn,
        sortDirection: state.sortDirection,
        languages: state.languages,
        onlyWatched: state.onlyWatched,
        excludeArchived: state.excludeArchived,
        viewMode: state.viewMode,
      }),
      migrate: (persistedState, version) => {
        const s = (persistedState ?? {}) as Partial<FilterState>;
        // v3 — any persisted state from v1/v2 gets its visibleColumns
        // reset to the new defaults so the density cleanup actually
        // reaches returning users. Users who customized their layout
        // pre-v3 will see the clean set and can toggle back via the
        // column picker.
        if (version < 3) {
          s.visibleColumns = [...DEFAULT_VISIBLE_COLUMNS];
        } else if (Array.isArray(s.visibleColumns)) {
          // Post-v3: filter out unknown ColumnId values and guarantee
          // required columns are present.
          const filtered = s.visibleColumns.filter((c): c is ColumnId =>
            ALL_COLUMNS.includes(c as ColumnId),
          );
          const withRequired = [...filtered];
          for (const req of REQUIRED_COLUMNS) {
            if (!withRequired.includes(req)) withRequired.unshift(req);
          }
          s.visibleColumns =
            withRequired.length > 0
              ? withRequired
              : [...DEFAULT_VISIBLE_COLUMNS];
        }
        return s as FilterState;
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Sidebar Store — mobile drawer + collapsed section state
// ---------------------------------------------------------------------------

interface SidebarState {
  // Transient — not persisted (would flash on refresh).
  mobileOpen: boolean;
  // Persisted — user prefers sections stay collapsed across sessions.
  collapsedSections: Record<string, boolean>;

  openMobile: () => void;
  closeMobile: () => void;
  toggleMobile: () => void;
  toggleSection: (id: string) => void;
  setSectionCollapsed: (id: string, collapsed: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => ({
      mobileOpen: false,
      collapsedSections: {},

      openMobile: () => set({ mobileOpen: true }),
      closeMobile: () => set({ mobileOpen: false }),
      toggleMobile: () => set((s) => ({ mobileOpen: !s.mobileOpen })),

      toggleSection: (id) => {
        const { collapsedSections } = get();
        set({
          collapsedSections: {
            ...collapsedSections,
            [id]: !collapsedSections[id],
          },
        });
      },

      setSectionCollapsed: (id, collapsed) => {
        const { collapsedSections } = get();
        set({
          collapsedSections: { ...collapsedSections, [id]: collapsed },
        });
      },
    }),
    {
      name: "starscreener-sidebar",
      partialize: (state) => ({
        collapsedSections: state.collapsedSections,
      }),
    },
  ),
);
