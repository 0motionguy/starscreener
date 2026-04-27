"use client";

/**
 * Sidebar — desktop persistent left rail (V2 chrome).
 *
 * Fetches the sidebar data bundle on mount (one HTTP round-trip to
 * /api/pipeline/sidebar-data) and feeds it into the shared
 * <SidebarContent>. The chrome is the V2 Node/01 industrial rail:
 * translucent gray-blue surface, hairline V2 borders, a `// TRENDINGREPO`
 * mono status row at the top, and the V2 launchpad tiles below.
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
} from "@/app/api/pipeline/sidebar-data/route";
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
      className="grid grid-cols-3 gap-1.5 px-3 pt-3 pb-3 border-b"
      style={{ borderColor: "var(--v2-line-100)" }}
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
              "v2-mono relative h-9 flex items-center justify-center gap-1.5",
              "text-[10px] transition-colors duration-150",
              active && "v2-bracket",
            )}
            style={{
              background: active ? "var(--v2-acc-soft)" : "var(--v2-bg-050)",
              border: `1px solid ${active ? "var(--v2-acc)" : "var(--v2-line-200)"}`,
              borderRadius: 2,
              color: active ? "var(--v2-acc)" : "var(--v2-ink-200)",
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
      className="px-3 py-2.5 border-b flex items-center justify-between shrink-0"
      style={{ borderColor: "var(--v2-line-100)" }}
    >
      <span
        className="v2-mono inline-flex items-center gap-2"
        style={{ color: "var(--v2-ink-300)", fontSize: 10 }}
      >
        <SystemMark size={12} />
        {"// TRENDINGREPO"}
      </span>
      <span
        className="v2-mono tabular-nums"
        style={{ color: "var(--v2-ink-500)", fontSize: 9 }}
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
  arxivPapers: 0,
  fundingSignals: 0,
  revenueOverlays: 0,
  npmPackages: 0,
};

export function useSidebarData(): SidebarData | null {
  const [data, setData] = useState<SidebarData | null>(null);

  useEffect(() => {
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
  }, []);

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

export function Sidebar() {
  const data = useSidebarData();
  const watchlistPreview = useWatchlistPreview(data?.reposById);

  // Width is driven by the parent `.app-shell` grid column (280px full /
  // 56px focused). We render the same chrome at both widths and let the
  // outer aside clip overflow when the column is narrow.
  return (
    <aside
      className="v3-chrome hidden md:flex md:flex-col w-full h-[calc(100vh-56px)] sticky top-14 border-r overflow-hidden"
      style={{
        borderColor: "var(--v3-line-200)",
        backdropFilter: "blur(8px)",
      }}
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
