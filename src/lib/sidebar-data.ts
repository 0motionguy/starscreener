// Shared sidebar-data builder.
//
// Single source of truth for the payload the desktop <Sidebar> and the
// mobile <MobileDrawer> both render. Lives in src/lib so two callers can
// reach it:
//   1. Root layout (src/app/layout.tsx) — calls this server-side and
//      passes the result into <Sidebar initialData={...} />, eliminating
//      the post-hydration fetch on every desktop page navigation.
//   2. /api/pipeline/sidebar-data — still exposed so MobileDrawer can
//      fetch lazily when the user opens the drawer (fetch never lands on
//      the critical path because the drawer is dynamic'd with ssr:false).

import { pipeline } from "@/lib/pipeline/pipeline";
import {
  getDerivedAvailableLanguages,
  getDerivedCategoryStats,
  getDerivedMetaCounts,
} from "@/lib/derived-insights";
import { getDerivedRepos } from "@/lib/derived-repos";
import {
  getSidebarSourceCounts,
  emptySidebarSourceCounts,
  type SidebarSourceCounts,
} from "@/lib/sidebar-source-counts";
import type { MetaCounts, MovementStatus } from "@/lib/types";
import type { CategoryStats } from "@/lib/pipeline/queries/aggregate";

export interface SidebarDataRepo {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  ownerAvatarUrl: string;
  momentumScore: number;
  movementStatus: MovementStatus;
  sparklineData: number[];
  stars: number;
  starsDelta24h: number;
  starsDelta24hMissing?: boolean;
}

export interface SidebarDataResponse {
  categoryStats: CategoryStats[];
  metaCounts: MetaCounts;
  availableLanguages: string[];
  reposById: Record<string, SidebarDataRepo>;
  unreadAlerts: number;
  sourceCounts: SidebarSourceCounts;
  trendingReposCount: number;
  generatedAt: string;
}

export interface BuildSidebarDataOptions {
  userId?: string;
  /**
   * Cap `reposById` to the top N entries by momentumScore.
   *
   * `getDerivedRepos()` returns the full assembled set (thousands of
   * repos with sparkline arrays — easily 500 KB – 2 MB serialized). The
   * API route returns the full map for backward compat with the mobile
   * drawer (user-driven, off the critical path). The root layout MUST
   * cap — it inlines the payload into every page's RSC stream including
   * mobile, where the sidebar is hidden behind `md:flex` and the bytes
   * would never paint a pixel. Top-200 covers virtually every watchlist
   * (the only consumer of this map is the 5-item watchlist preview).
   */
  reposByIdTopN?: number;
}

export async function buildSidebarData(
  opts: BuildSidebarDataOptions = {},
): Promise<SidebarDataResponse> {
  const { userId, reposByIdTopN } = opts;
  const repos = getDerivedRepos();
  const categoryStats = getDerivedCategoryStats(repos);
  const metaCounts = getDerivedMetaCounts(repos);
  const availableLanguages = getDerivedAvailableLanguages(repos);

  // Compact repo map keyed by id. Only the fields the sidebar actually
  // renders travel over the wire so the payload stays small. When a cap
  // is requested, slice the top-N by momentum so the watchlist preview
  // can still resolve popular tracked repos.
  const reposForMap =
    typeof reposByIdTopN === "number" && reposByIdTopN < repos.length
      ? [...repos]
          .sort((a, b) => b.momentumScore - a.momentumScore)
          .slice(0, reposByIdTopN)
      : repos;
  const reposById: Record<string, SidebarDataRepo> = {};
  for (const r of reposForMap) {
    reposById[r.id] = {
      id: r.id,
      fullName: r.fullName,
      owner: r.owner,
      name: r.name,
      ownerAvatarUrl: r.ownerAvatarUrl,
      momentumScore: r.momentumScore,
      movementStatus: r.movementStatus,
      sparklineData: r.sparklineData,
      stars: r.stars,
      starsDelta24h: r.starsDelta24h,
      starsDelta24hMissing: r.starsDelta24hMissing,
    };
  }

  // Unread alerts — optional, keyed by userId. Default to 0 when absent
  // or when the pipeline isn't ready.
  let unreadAlerts = 0;
  try {
    await pipeline.ensureReady();
    const events = pipeline.getAlerts(userId);
    unreadAlerts = events.filter((e) => e.readAt === null).length;
  } catch {
    unreadAlerts = 0;
  }

  // Per-source counts for the sidebar count badges. Degrade to zeros on
  // cold data-store / read error so the sidebar still renders.
  let sourceCounts: SidebarSourceCounts;
  try {
    sourceCounts = await getSidebarSourceCounts();
  } catch {
    sourceCounts = emptySidebarSourceCounts();
  }

  return {
    categoryStats,
    metaCounts,
    availableLanguages,
    reposById,
    unreadAlerts,
    sourceCounts,
    trendingReposCount: repos.length,
    generatedAt: new Date().toISOString(),
  };
}
