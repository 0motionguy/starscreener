"use client";

/**
 * Sidebar — desktop persistent left rail (V2 chrome).
 *
 * Receives the sidebar data bundle from the root layout via `initialData`
 * (server-rendered, no client fetch). The chrome is the V2 Node/01
 * industrial rail: translucent gray-blue surface, hairline V2 borders,
 * a `// TRENDINGREPO` mono status row at the top, and the V2 launchpad
 * tiles below.
 *
 * The hooks `useSidebarData()` and `useWatchlistPreview()` are still
 * exported — `MobileDrawer` uses them to fetch lazily when the user
 * opens the drawer (off the critical path because the drawer is dynamic'd
 * with ssr:false). When called with no arg, the hook fetches on mount;
 * when seeded with `initialData`, it returns immediately and skips the
 * round-trip.
 *
 * Width matches the AppShell grid column (280px in `data-mode="full"`,
 * 56px when AppShell flips to `data-mode="focused"`). The CSS handles the
 * column width — this component renders the same chrome at both widths,
 * and the inner content overflows-hidden when narrow.
 */
import { useEffect, useMemo, useState } from "react";
import { useWatchlistStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { SidebarContent } from "./SidebarContent";
import { SidebarProfileBox } from "./SidebarProfileBox";
import { SidebarSkeleton } from "./SidebarSkeleton";
import { useSidebarOverlayStore } from "./SidebarUserOverlayBridge";
import type {
  SidebarDataRepo,
  SidebarDataResponse,
  SidebarShellResponse,
} from "@/lib/sidebar-data";
import type { SidebarWatchlistPreviewRepo } from "./SidebarWatchlistPreview";

// LaunchpadStrip (CLI/MCP/profile tiles) was removed 2026-05-09 - the
// component had been carrying an `@eslint-disable no-unused-vars` marker for
// weeks and was never rendered from the sidebar. Profile entry now lives
// solely in <SidebarProfileBox /> below. If the launchpad placement returns,
// re-introduce the helpers + LaunchpadTile interface alongside the new
// render site (history available via `git log --diff-filter=D -- Sidebar.tsx`).

// ---------------------------------------------------------------------------
// Data fetch hook — shared by Sidebar + MobileDrawer
// ---------------------------------------------------------------------------

export interface SidebarData {
  categoryStats: SidebarDataResponse["categoryStats"];
  metaCounts: SidebarDataResponse["metaCounts"];
  availableLanguages: SidebarDataResponse["availableLanguages"];
  reposById: Record<string, SidebarDataRepo>;
  /**
   * Always 0 when seeded from a shell payload (the overlay store is the
   * source of truth post-split). Kept on the type for back-compat with
   * the MobileDrawer which still consumes the legacy combined payload.
   */
  unreadAlerts: number;
  sourceCounts: SidebarDataResponse["sourceCounts"];
  trendingReposCount: number;
}

const EMPTY_SOURCE_COUNTS: SidebarDataResponse["sourceCounts"] = {
  hackernewsStories: 0,
  lobstersStories: 0,
  devtoArticles: 0,
  blueskyPosts: 0,
  redditPosts: 0,
  producthuntLaunches: 0,
  fundingSignals: 0,
  revenueOverlays: 0,
  npmPackages: 0,
  skillsItems: 0,
  mcpItems: 0,
  agentRepos: 0,
  twitterRepos: 0,
  hfModels: 0,
  hfDatasets: 0,
  hfSpaces: 0,
  arxivPapers: 0,
  citedRepos: 0,
};

/**
 * Sidebar data hook. When called with `initialData` (the desktop path,
 * fed by the root layout's server-side build), returns it directly and
 * never fires a network request. When called bare (the MobileDrawer
 * path), fetches `/api/pipeline/sidebar-data` once on mount.
 */
export function useSidebarData(
  initialData?: SidebarDataResponse | null,
): SidebarData | null {
  const seed: SidebarData | null = initialData
    ? {
        categoryStats: initialData.categoryStats,
        metaCounts: initialData.metaCounts,
        availableLanguages: initialData.availableLanguages,
        reposById: initialData.reposById,
        unreadAlerts: initialData.unreadAlerts ?? 0,
        sourceCounts: initialData.sourceCounts ?? EMPTY_SOURCE_COUNTS,
        trendingReposCount: initialData.trendingReposCount ?? 0,
      }
    : null;
  const [data, setData] = useState<SidebarData | null>(seed);

  useEffect(() => {
    if (initialData) return; // Already seeded server-side; skip the round-trip.
    let cancelled = false;
    fetch("/api/pipeline/sidebar-data")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((json: SidebarDataResponse) => {
        if (cancelled) return;
        setData({
          categoryStats: json.categoryStats,
          metaCounts: json.metaCounts,
          availableLanguages: json.availableLanguages,
          reposById: json.reposById,
          unreadAlerts: json.unreadAlerts ?? 0,
          sourceCounts: json.sourceCounts ?? EMPTY_SOURCE_COUNTS,
          trendingReposCount: json.trendingReposCount ?? 0,
        });
      })
      .catch(() => {
        // Silent fail — sidebar remains in skeleton state. A retry UI
        // can be added in a later polish pass.
      });
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  return data;
}

/**
 * Build the watchlist preview from the local watchlist. Root layout no
 * longer inlines a momentum repo map into every page; when watched ids are
 * missing from the seed map we hydrate only the newest 5 exact ids.
 */
export function useWatchlistPreview(
  reposById: Record<string, SidebarDataRepo> | undefined,
): SidebarWatchlistPreviewRepo[] {
  const watchlist = useWatchlistStore((s) => s.repos);
  const [hydratedReposById, setHydratedReposById] = useState<
    Record<string, SidebarDataRepo>
  >({});

  const newestWatchIds = useMemo(
    () =>
      [...watchlist]
        .sort((a, b) =>
          a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0,
        )
        .slice(0, 5)
        .map((item) => item.repoId),
    [watchlist],
  );

  const mergedReposById = useMemo(
    () => ({ ...hydratedReposById, ...(reposById ?? {}) }),
    [hydratedReposById, reposById],
  );

  const missingIds = useMemo(
    () => newestWatchIds.filter((id) => !mergedReposById[id]),
    [mergedReposById, newestWatchIds],
  );
  const missingKey = missingIds.join(",");

  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    const params = new URLSearchParams({ ids: missingKey });
    fetch(`/api/pipeline/sidebar-data?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { reposById?: Record<string, SidebarDataRepo> } | null) => {
        if (cancelled || !json?.reposById) return;
        setHydratedReposById((current) => ({ ...current, ...json.reposById }));
      })
      .catch(() => {
        // Missing watchlist hydration should not break sidebar navigation.
      });
    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  return useMemo(
    () =>
      newestWatchIds
        .map((id) => mergedReposById[id])
        .filter((repo): repo is SidebarWatchlistPreviewRepo => Boolean(repo)),
    [mergedReposById, newestWatchIds],
  );
}

// ---------------------------------------------------------------------------
// Sidebar root
// ---------------------------------------------------------------------------

const COMPACT_STORAGE_KEY = "sidebar.compact";

export function Sidebar({
  initialShell,
}: {
  initialShell?: SidebarShellResponse | null;
} = {}) {
  // Bridge the new shell payload (no `unreadAlerts`) into the existing
  // hook contract. The hook expects a `SidebarDataResponse`-shaped seed;
  // we synthesise `unreadAlerts: 0` here because the overlay store is the
  // real source of truth post-split.
  const seedFromShell: SidebarDataResponse | null = useMemo(
    () => (initialShell ? { ...initialShell, unreadAlerts: 0 } : null),
    [initialShell],
  );
  const data = useSidebarData(seedFromShell);
  const watchlistPreview = useWatchlistPreview(data?.reposById);
  const watchCount = useWatchlistStore((s) => s.repos.length);
  // Per-user overlay (unread-alert count) lives in a transient Zustand
  // store fed by `<SidebarUserOverlayBridge />` after the Clerk session
  // resolves. Anonymous viewers see 0.
  const unreadAlerts = useSidebarOverlayStore((s) => s.unreadAlerts);

  // Compact mode — user-toggled vertical density preference. Persisted in
  // localStorage. Hydration-gated to avoid SSR mismatch: the server always
  // renders at default density; the client flips to the persisted value
  // after mount.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(COMPACT_STORAGE_KEY) === "1") {
        setCompact(true);
      }
    } catch {
      // localStorage may be unavailable (private browsing, quota); default
      // off is the right behaviour.
    }
  }, []);
  const toggleCompact = () => {
    setCompact((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COMPACT_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // see above
      }
      return next;
    });
  };

  // Width is driven by the parent `.app-shell` grid column (280px full /
  // 56px focused). We render the same chrome at both widths and let the
  // outer aside clip overflow when the column is narrow.
  return (
    <aside
      className={cn(
        "sidebar hidden w-full overflow-hidden md:flex md:flex-col",
        compact && "compact",
      )}
    >
      <SidebarProfileBox
        watchCount={watchCount}
        alertCount={unreadAlerts}
        dropCount={0}
      />
      {data ? (
        <SidebarContent
          categoryStats={data.categoryStats}
          metaCounts={data.metaCounts}
          availableLanguages={data.availableLanguages}
          watchlistPreview={watchlistPreview}
          unreadAlerts={unreadAlerts}
          sourceCounts={data.sourceCounts}
          trendingReposCount={data.trendingReposCount}
          compact={compact}
          onToggleCompact={toggleCompact}
        />
      ) : (
        <SidebarSkeleton />
      )}
    </aside>
  );
}
