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
import { Plug, Terminal, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useUser } from "@clerk/nextjs";
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

// ---------------------------------------------------------------------------
// LaunchpadStrip — prominent CLI / MCP entry tiles + conditional user slot.
//
// Width adapts:
//   • Anonymous (no session)  →   2-up grid, full-width CLI + MCP tiles.
//   • Logged-in user          →   3-up grid; the third tile is the user
//                                  profile (handle + avatar) linking to
//                                  /u/<handle>. We DO NOT render a "YOU"
//                                  placeholder for anonymous users —
//                                  per design, the user is invisible
//                                  until they're actually registered.
//
// Session check uses the public `/api/auth/session` endpoint (auto-issued
// `ss_user` cookie). One fetch on mount, cached in component state.
// ---------------------------------------------------------------------------

interface LaunchpadTile {
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
  matchPrefix?: string; // active when pathname startsWith this
}

const LAUNCHPAD_TILES: LaunchpadTile[] = [
  {
    href: "/cli",
    icon: Terminal,
    label: "CLI",
    description: "ss in your terminal",
    matchPrefix: "/cli",
  },
  {
    href: "/portal/docs",
    icon: Plug,
    label: "MCP",
    description: "agents + IDEs",
    matchPrefix: "/portal/docs",
  },
];

function useUserSession({
  enabled,
}: {
  enabled: boolean;
}): { loaded: boolean; userId: string | null } {
  const [state, setState] = useState<{ loaded: boolean; userId: string | null }>(
    { loaded: false, userId: null },
  );
  useEffect(() => {
    if (!enabled) {
      // Clerk says anonymous → never hit `/api/auth/session`. The launchpad
      // strip stays in 2-up "no profile tile" mode without paying for the
      // round-trip on every anonymous page render.
      setState({ loaded: true, userId: null });
      return;
    }
    let cancelled = false;
    fetch("/api/auth/session", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { ok: false }))
      .then((data: { ok?: boolean; userId?: string }) => {
        if (cancelled) return;
        setState({
          loaded: true,
          userId: data?.ok && data.userId ? data.userId : null,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ loaded: true, userId: null });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return state;
}

function shortHandle(userId: string): string {
  // Public user IDs look like `a_xxx` (anon) or `u_xxx` (email-derived).
  // We trim the prefix and shorten so the chip stays readable in the rail.
  const trimmed = userId.replace(/^[au]_/, "");
  return trimmed.slice(0, 6).toUpperCase();
}

const CLERK_PUBLIC_KEY_PRESENT = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

// useUser() hard-throws outside <ClerkProvider />. The layout skips the
// provider when Clerk isn't configured (CI builds, anonymous previews),
// so we have two hook trees: one that calls useUser() (Clerk present)
// and one that hard-codes anonymous (Clerk absent). The branch is chosen
// by a module-level constant so React's hook order stays stable per
// component instance.
function useClerkSignedIn(): { isLoaded: boolean; isSignedIn: boolean } {
  const { isLoaded, isSignedIn } = useUser();
  return { isLoaded, isSignedIn: Boolean(isSignedIn) };
}
function useAnonymousSignedIn(): { isLoaded: boolean; isSignedIn: boolean } {
  return { isLoaded: true, isSignedIn: false };
}
const useSignedInSafe = CLERK_PUBLIC_KEY_PRESENT
  ? useClerkSignedIn
  : useAnonymousSignedIn;

// Kept while the launchpad placement is reworked; do not render it from the
// hot sidebar path until the auth/session fetch stays off anonymous pages.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LaunchpadStrip() {
  const pathname = usePathname() ?? "/";
  const { isLoaded, isSignedIn } = useSignedInSafe();
  const sessionEnabled = isLoaded && Boolean(isSignedIn);
  const { userId } = useUserSession({ enabled: sessionEnabled });
  const showProfile = Boolean(userId);
  const cols = showProfile ? "grid-cols-3" : "grid-cols-2";
  return (
    <nav
      aria-label="Launchpad"
      className={cn("group grid gap-1.5 px-3 pb-3 pt-3", cols)}
    >
      {LAUNCHPAD_TILES.map((tile) => {
        const active = pathname === tile.href
          || (tile.matchPrefix && pathname.startsWith(tile.matchPrefix));
        const Icon = tile.icon;
        return (
          <Link
            key={tile.href}
            href={tile.href}
            aria-label={`${tile.label} — ${tile.description}`}
            title={tile.description}
            className={cn(
              "launchpad-tile relative flex h-12 flex-col items-center justify-center gap-0.5",
              "text-[11px] font-semibold tracking-wide",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
              active && "is-active",
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            <span className="text-[10px] uppercase tracking-[0.18em]">{tile.label}</span>
          </Link>
        );
      })}
      {showProfile && userId ? (
        <Link
          href={`/u/${userId}`}
          aria-label="Your profile"
          title="Your profile"
          className={cn(
            "launchpad-tile relative flex h-12 flex-col items-center justify-center gap-0.5",
            "text-[11px] font-semibold tracking-wide",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
            pathname.startsWith("/u/") && "is-active",
          )}
        >
          <UserRound className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          <span className="text-[10px] uppercase tracking-[0.18em]">{shortHandle(userId)}</span>
        </Link>
      ) : null}
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
