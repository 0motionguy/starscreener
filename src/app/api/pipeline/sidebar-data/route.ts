// GET /api/pipeline/sidebar-data
//
// One-shot bundle for every piece of data the sidebar needs:
//   - categoryStats   — per-category repoCount + avgMomentum
//   - metaCounts      — 7 meta-bar counters
//   - availableLanguages — unique languages across all tracked repos
//   - reposById       — compact repo map (id, fullName, momentumScore,
//                       sparklineData, starsDelta24h) so the client can
//                       build the Watching preview by intersecting the
//                       local watchlist store with this map.
//
// Keeping this route in one place means the sidebar (desktop + mobile
// drawer) only makes a single round-trip on mount.
//
// Query params:
//   userId  optional — when supplied, the response includes an
//           `unreadAlerts` count for that user.

import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@/lib/pipeline/pipeline";
import {
  getDerivedAvailableLanguages,
  getDerivedCategoryStats,
  getDerivedMetaCounts,
} from "@/lib/derived-insights";
import { getDerivedRepos } from "@/lib/derived-repos";
import type { MetaCounts } from "@/lib/types";
import type { CategoryStats } from "@/lib/pipeline/queries/aggregate";

export interface SidebarDataRepo {
  id: string;
  fullName: string;
  momentumScore: number;
  sparklineData: number[];
  starsDelta24h: number;
}

export interface SidebarDataResponse {
  categoryStats: CategoryStats[];
  metaCounts: MetaCounts;
  availableLanguages: string[];
  reposById: Record<string, SidebarDataRepo>;
  unreadAlerts: number;
  generatedAt: string;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<SidebarDataResponse | { error: string }>> {
  try {
    const repos = getDerivedRepos();
    const categoryStats = getDerivedCategoryStats(repos);
    const metaCounts = getDerivedMetaCounts(repos);

    // Build a compact repo map keyed by id. Only the fields the sidebar
    // actually renders travel over the wire so the payload stays small
    // even with 80+ repos.
    const reposById: Record<string, SidebarDataRepo> = {};
    for (const r of repos) {
      reposById[r.id] = {
        id: r.id,
        fullName: r.fullName,
        momentumScore: r.momentumScore,
        sparklineData: r.sparklineData,
        starsDelta24h: r.starsDelta24h,
      };
    }
    const availableLanguages = getDerivedAvailableLanguages(repos);

    // Unread alerts — optional, keyed by userId. Default to 0 when absent.
    const userId = request.nextUrl.searchParams.get("userId") ?? undefined;
    let unreadAlerts = 0;
    try {
      await pipeline.ensureReady();
      const events = pipeline.getAlerts(userId);
      unreadAlerts = events.filter((e) => e.readAt === null).length;
    } catch {
      unreadAlerts = 0;
    }

    return NextResponse.json(
      {
        categoryStats,
        metaCounts,
        availableLanguages,
        reposById,
        unreadAlerts,
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
