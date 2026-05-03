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
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plug, Terminal, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useWatchlistStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/app-meta";
import { SystemMark } from "@/components/v3";
import { SidebarContent } from "./SidebarContent";
import { SidebarSkeleton } from "./SidebarSkeleton";
import type {
  SidebarDataRepo,
  SidebarDataResponse,
} from "@/lib/sidebar-data";
import type { SidebarWatchlistPreviewRepo } from "./SidebarWatchlistPreview";

// ---------------------------------------------------------------------------
// LaunchpadStrip — 3-tile shortcut row, V2-styled.
// ---------------------------------------------------------------------------

interface LaunchpadTile {
  href: string;
  icon: LucideIcon;
  label: string;
  matchPrefix?: string; // active when pathname startsWith this
}

const LAUNCHPAD_TILES: LaunchpadTile[] = [
  { href: "/you", icon: User, label: "You", matchPrefix: "/you" },
  {
    href: "/portal/docs",
    icon: Plug,
    label: "MCP",
    matchPrefix: "/portal/docs",
  },
  { href: "/cli", icon: Terminal, label: "CLI", matchPrefix: "/cli" },
];

function LaunchpadStrip() {
  const pathname = usePathname() ?? "/";
  return (
    <nav
      aria-label="Launchpad"
      className="group grid grid-cols-3 gap-1.5 px-3 pb-3 pt-2"
    >
      {LAUNCHPAD_TILES.map((tile) => {
        const active = pathname === tile.href
          || (tile.matchPrefix && pathname.startsWith(tile.matchPrefix));
        const Icon = tile.icon;
        return (
          <Link
            key={tile.href}
            href={tile.href}
            aria-label={tile.label}
            className={cn(
              "nav relative flex h-8 items-center justify-center gap-1.5 px-1",
              "text-[10px] transition-colors duration-150",
            )}
            style={{
              background: active ? "var(--v4-acc-soft)" : "var(--v4-bg-050)",
              border: `1px solid ${active ? "var(--v4-acc)" : "var(--v4-line-200)"}`,
              color: active ? "var(--v4-acc)" : "var(--v4-ink-200)",
            }}
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
            <span>{tile.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Top status block — system identity (`// TRENDINGREPO` + version).
// ---------------------------------------------------------------------------

function SidebarStatusHeader() {
  return (
    <div
      className="group flex shrink-0 items-center justify-between px-3 pb-2 pt-3"
    >
      <span
        className="group-label inline-flex items-center gap-2"
        style={{ color: "var(--v4-ink-300)", fontSize: 10 }}
      >
        <SystemMark size={12} />
        {"// TRENDINGREPO"}
      </span>
      <span
        className="font-mono tabular-nums"
        style={{ color: "var(--v4-ink-300)", fontSize: 11 }}
      >
        v{APP_VERSION}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data fetch hook — shared by Sidebar + MobileDrawer
// ---------------------------------------------------------------------------

export interface SidebarData {
  categoryStats: SidebarDataResponse["categoryStats"];
  metaCounts: SidebarDataResponse["metaCounts"];
  availableLanguages: SidebarDataResponse["availableLanguages"];
  reposById: Record<string, SidebarDataRepo>;
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
 * Build the watchlist preview by intersecting the local watchlist
 * (client-persisted) with the repo-by-id map from the server. Newest
 * additions first, capped at 5.
 */
export function useWatchlistPreview(
  reposById: Record<string, SidebarDataRepo> | undefined,
): SidebarWatchlistPreviewRepo[] {
  const watchlist = useWatchlistStore((s) => s.repos);

  return useMemo(() => {
    if (!reposById) return [];
    const sorted = [...watchlist].sort((a, b) =>
      a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0,
    );
    const out: SidebarWatchlistPreviewRepo[] = [];
    for (const item of sorted) {
      const repo = reposById[item.repoId];
      if (!repo) continue;
      out.push(repo);
      if (out.length >= 5) break;
    }
    return out;
  }, [watchlist, reposById]);
}

// ---------------------------------------------------------------------------
// Sidebar root
// ---------------------------------------------------------------------------

export function Sidebar({
  initialData,
}: {
  initialData?: SidebarDataResponse | null;
} = {}) {
  const data = useSidebarData(initialData);
  const watchlistPreview = useWatchlistPreview(data?.reposById);

  // Width is driven by the parent `.app-shell` grid column (280px full /
  // 56px focused). We render the same chrome at both widths and let the
  // outer aside clip overflow when the column is narrow.
  return (
    <aside
      className="sidebar hidden w-full overflow-hidden md:flex md:flex-col"
    >
      <SidebarStatusHeader />
      <LaunchpadStrip />
      {data ? (
        <SidebarContent
          categoryStats={data.categoryStats}
          metaCounts={data.metaCounts}
          availableLanguages={data.availableLanguages}
          watchlistPreview={watchlistPreview}
          unreadAlerts={data.unreadAlerts}
          sourceCounts={data.sourceCounts}
          trendingReposCount={data.trendingReposCount}
        />
      ) : (
        <SidebarSkeleton />
      )}
    </aside>
  );
}
