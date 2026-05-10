// Shared sidebar-data builder.
//
// Two-tier split (the rendering critical-path optimisation that the layout
// depends on):
//
//   * `getPublicSidebarShell()` — public, anonymous-safe payload. Holds
//     categories, sourceCounts, language list, the (capped) repo map, and
//     `trendingReposCount`. NO `pipeline.ensureReady()`, NO user-keyed
//     data. Cheap enough to inline in the root layout's RSC stream on
//     every render.
//   * `getUserSidebarOverlay({ userId })` — per-user overlay containing
//     just `unreadAlerts`. Fetched client-side via `/api/pipeline/sidebar-overlay`
//     by the bridge component, only when Clerk says the viewer is signed in.
//   * `buildSidebarData()` — back-compat wrapper composing the two. Kept
//     so the deprecated `/api/pipeline/sidebar-data` shape (used by the
//     mobile drawer) keeps working until it migrates to the split.
//
// Single source of truth for the payload the desktop <Sidebar> and the
// mobile <MobileDrawer> both render. Lives in src/lib so two callers can
// reach it:
//   1. Root layout (src/app/layout.tsx) — calls `getPublicSidebarShell`
//      server-side and passes the result into <Sidebar initialShell={...} />,
//      eliminating the post-hydration fetch on every desktop page navigation.
//   2. /api/pipeline/sidebar-data — kept for the mobile drawer; the user-
//      keyed overlay support has been removed (overlay now has its own
//      private/no-store route).

import { pipeline } from "@/lib/pipeline/pipeline";
import {
  getDerivedAvailableLanguages,
  getDerivedCategoryStats,
  getDerivedMetaCounts,
} from "@/lib/derived-insights";
import {
  getDerivedRepoById,
  getDerivedRepos,
} from "@/lib/derived-repos";
import {
  getSidebarSourceCounts,
  emptySidebarSourceCounts,
  type SidebarSourceCounts,
} from "@/lib/sidebar-source-counts";
import type { MetaCounts, Repo } from "@/lib/types";
import type { CategoryStats } from "@/lib/pipeline/queries/aggregate";

export interface SidebarDataRepo {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  ownerAvatarUrl: string;
  starsDelta24h: number;
  starsDelta24hMissing?: boolean;
  channelStatus?: Repo["channelStatus"];
}

/**
 * Public, anonymous-safe shell. No pipeline.ensureReady(), no user-keyed
 * fields. Safe to render into every page's RSC stream on every render.
 */
export interface SidebarShellResponse {
  categoryStats: CategoryStats[];
  metaCounts: MetaCounts;
  availableLanguages: string[];
  reposById: Record<string, SidebarDataRepo>;
  sourceCounts: SidebarSourceCounts;
  trendingReposCount: number;
  generatedAt: string;
}

/**
 * Per-user overlay. Only the fields that depend on `userId`. Fetched
 * client-side via a private no-store route, only when the viewer is
 * signed in.
 */
export interface SidebarOverlayResponse {
  unreadAlerts: number;
}

/**
 * Back-compat composite of shell + overlay. Returned by the legacy
 * /api/pipeline/sidebar-data route (mobile drawer) when no `userId`
 * was passed.
 */
export interface SidebarDataResponse
  extends SidebarShellResponse,
    SidebarOverlayResponse {}

export interface BuildSidebarDataOptions {
  userId?: string;
  /**
   * Cap `reposById` to the top N derived entries (already ranked by momentum).
   * Use 0 on root/mobile first paint: watched repos are hydrated by exact id
   * after the client knows the local watchlist.
   */
  reposByIdTopN?: number;
  /**
   * Legacy facets retained for the sidebar-data API shape. The current sidebar
   * chrome does not render them, so root layout can skip them to keep every
   * page's RSC payload smaller.
   */
  includeLegacyFacets?: boolean;
  onTiming?: (name: string, durationMs: number) => void;
}

export type GetPublicSidebarShellOptions = Pick<
  BuildSidebarDataOptions,
  "reposByIdTopN" | "includeLegacyFacets" | "onTiming"
>;

function toSidebarDataRepo(repo: Repo): SidebarDataRepo {
  return {
    id: repo.id,
    fullName: repo.fullName,
    owner: repo.owner,
    name: repo.name,
    ownerAvatarUrl: repo.ownerAvatarUrl,
    starsDelta24h: repo.starsDelta24h,
    starsDelta24hMissing: repo.starsDelta24hMissing,
    channelStatus: repo.channelStatus,
  };
}

export function getSidebarReposByIds(
  ids: readonly string[],
): Record<string, SidebarDataRepo> {
  const reposById: Record<string, SidebarDataRepo> = {};
  const seen = new Set<string>();
  for (const rawId of ids) {
    const id = rawId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const repo = getDerivedRepoById(id);
    if (repo) {
      reposById[repo.id] = toSidebarDataRepo(repo);
    }
  }
  return reposById;
}

/**
 * Build the public sidebar shell. Anonymous-safe; does NOT call
 * `pipeline.ensureReady()` or read alert state. Cheap enough to inline
 * in the layout RSC stream on every render.
 */
export async function getPublicSidebarShell(
  opts: GetPublicSidebarShellOptions = {},
): Promise<SidebarShellResponse> {
  const { reposByIdTopN, includeLegacyFacets = true, onTiming } = opts;
  const timed = <T>(name: string, fn: () => T): T => {
    const start = performance.now();
    const out = fn();
    onTiming?.(name, performance.now() - start);
    return out;
  };
  const timedAsync = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const start = performance.now();
    const out = await fn();
    onTiming?.(name, performance.now() - start);
    return out;
  };
  const repos = timed("getDerivedRepos", () => getDerivedRepos());
  const categoryStats = includeLegacyFacets
    ? timed("getDerivedCategoryStats", () => getDerivedCategoryStats(repos))
    : [];
  const metaCounts = timed("getDerivedMetaCounts", () => getDerivedMetaCounts(repos));
  const availableLanguages = includeLegacyFacets
    ? timed("getDerivedAvailableLanguages", () =>
        getDerivedAvailableLanguages(repos),
      )
    : [];

  // Compact repo map keyed by id. Only the fields the sidebar actually
  // renders travel over the wire so the payload stays small. When a cap
  // is requested, slice the top-N by momentum so the watchlist preview
  // can still resolve popular tracked repos.
  const reposForMap =
    typeof reposByIdTopN === "number" && reposByIdTopN < repos.length
      ? repos.slice(0, reposByIdTopN)
      : repos;
  const reposById: Record<string, SidebarDataRepo> = {};
  timed("buildReposById", () => {
    for (const r of reposForMap) {
      reposById[r.id] = toSidebarDataRepo(r);
    }
  });

  // Per-source counts for the sidebar count badges. Degrade to zeros on
  // cold data-store / read error so the sidebar still renders.
  let sourceCounts: SidebarSourceCounts;
  try {
    sourceCounts = await timedAsync("getSidebarSourceCounts", () =>
      getSidebarSourceCounts(),
    );
  } catch {
    sourceCounts = emptySidebarSourceCounts();
  }

  return {
    categoryStats,
    metaCounts,
    availableLanguages,
    reposById,
    sourceCounts,
    trendingReposCount: repos.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Per-user overlay. Returns just `{ unreadAlerts }`. Does NOT call
 * `pipeline.ensureReady()` — the bootstrap warmup runs that exactly once
 * at server start (`src/lib/bootstrap.ts`); subsequent calls find the
 * pipeline ready. If the warmup is still in flight when this runs we
 * gracefully degrade to `unreadAlerts: 0` rather than blocking.
 */
export async function getUserSidebarOverlay({
  userId,
}: {
  userId: string;
}): Promise<SidebarOverlayResponse> {
  try {
    const events = pipeline.getAlerts(userId);
    return { unreadAlerts: events.filter((e) => e.readAt === null).length };
  } catch {
    return { unreadAlerts: 0 };
  }
}

/**
 * Back-compat wrapper. Composes the public shell with an optional user
 * overlay. Defaults `unreadAlerts` to 0 when no `userId` is supplied.
 *
 * @deprecated Prefer `getPublicSidebarShell()` for SSR + the dedicated
 * `/api/pipeline/sidebar-overlay` route for per-user data. This wrapper
 * stays as the source for the legacy `/api/pipeline/sidebar-data` route
 * (mobile drawer) until that consumer migrates.
 */
export async function buildSidebarData(
  opts: BuildSidebarDataOptions = {},
): Promise<SidebarDataResponse> {
  const { userId, ...shellOpts } = opts;
  const shell = await getPublicSidebarShell(shellOpts);
  if (!userId) return { ...shell, unreadAlerts: 0 };
  const overlay = await getUserSidebarOverlay({ userId });
  return { ...shell, ...overlay };
}
