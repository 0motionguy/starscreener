"use client";

/**
 * Sidebar — desktop persistent left rail.
 *
 * Fetches the sidebar data bundle on mount (one HTTP round-trip to
 * /api/pipeline/sidebar-data) and feeds it into the shared
 * <SidebarContent>. When the AppShell applies `data-mode="focused"` on
 * repo-detail routes, the parent grid column shrinks to 56px and we
 * switch to a compact <IconRail> variant instead.
 *
 * The rail fetch is client-side because the root layout is a server
 * component that can't easily thread props through to a client sidebar
 * sitting as a sibling of the page `<main>`. The tradeoff — a one-shot
 * fetch on mount — is negligible compared to the complexity of a
 * server-component wrapper.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Eye,
  GitCompareArrows,
  Plug,
  Terminal,
  TrendingUp,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useWatchlistStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { SidebarContent } from "./SidebarContent";
import { SidebarSkeleton } from "./SidebarSkeleton";
import type {
  SidebarDataRepo,
  SidebarDataResponse,
} from "@/app/api/pipeline/sidebar-data/route";
import type { SidebarWatchlistPreviewRepo } from "./SidebarWatchlistPreview";

// ---------------------------------------------------------------------------
// LaunchpadStrip — 3-tile shortcut row for power-user integrations
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
      className="grid grid-cols-3 gap-1.5 px-3 pt-3 pb-2 border-b border-border-primary"
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
              "h-9 flex items-center justify-center gap-1.5 rounded-button border transition-all",
              "text-[11px] font-mono uppercase tracking-wider",
              active
                ? "bg-brand border-brand text-black"
                : "border-border-primary text-text-secondary hover:text-text-primary hover:border-brand hover:shadow-[0_0_12px_var(--color-brand-glow)]",
            )}
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={2} />
            <span>{tile.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// IconRail — focused-mode compact variant
// ---------------------------------------------------------------------------

interface RailItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

const RAIL_ITEMS: RailItem[] = [
  { href: "/", icon: TrendingUp, label: "Trending" },
  { href: "/watchlist", icon: Eye, label: "Watchlist" },
  { href: "/compare", icon: GitCompareArrows, label: "Compare" },
];

function IconRail() {
  const pathname = usePathname() ?? "/";
  return (
    <nav
      aria-label="Primary"
      className="flex flex-col items-center gap-1 py-3"
    >
      {RAIL_ITEMS.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            title={item.label}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-button transition-colors",
              active
                ? "bg-functional-subtle text-functional"
                : "text-text-tertiary hover:text-text-primary hover:bg-bg-card-hover",
            )}
            style={
              active
                ? { boxShadow: "inset 2px 0 0 var(--color-functional)" }
                : undefined
            }
          >
            <Icon className="w-4 h-4" strokeWidth={2} />
          </Link>
        );
      })}
    </nav>
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
}

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
  const pathname = usePathname() ?? "/";
  const focused = /^\/repo\/[^/]+\/[^/]+/.test(pathname);

  const data = useSidebarData();
  const watchlistPreview = useWatchlistPreview(data?.reposById);

  if (focused) {
    return (
      <aside className="hidden md:flex md:flex-col w-[56px] h-[calc(100vh-56px)] sticky top-14 border-r border-border-primary bg-bg-primary">
        <IconRail />
      </aside>
    );
  }

  return (
    <aside className="hidden md:flex md:flex-col w-[280px] h-[calc(100vh-56px)] sticky top-14 border-r border-border-primary bg-bg-primary">
      <LaunchpadStrip />
      {data ? (
        <SidebarContent
          categoryStats={data.categoryStats}
          metaCounts={data.metaCounts}
          availableLanguages={data.availableLanguages}
          watchlistPreview={watchlistPreview}
          unreadAlerts={data.unreadAlerts}
        />
      ) : (
        <SidebarSkeleton />
      )}
    </aside>
  );
}
