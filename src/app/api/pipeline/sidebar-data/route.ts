// GET /api/pipeline/sidebar-data
//
// One-shot bundle for every piece of data the sidebar needs. Single
// source of truth lives in `@/lib/sidebar-data` so the desktop sidebar
// (rendered inside the root layout via `initialData`) and the mobile
// drawer (which fetches lazily on user-open through this endpoint) stay
// in sync.
//
// Query params:
//   userId  optional — when supplied, the response includes an
//           `unreadAlerts` count for that user.

import { NextRequest, NextResponse } from "next/server";
import { errorEnvelope } from "@/lib/api/error-response";
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

export const runtime = "nodejs";

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

export async function GET(
  request: NextRequest,
): Promise<NextResponse<SidebarDataResponse | { error: string }>> {
  try {
    const userId = request.nextUrl.searchParams.get("userId") ?? undefined;
    const repos = getDerivedRepos();
    const categoryStats = getDerivedCategoryStats(repos);
    const metaCounts = getDerivedMetaCounts(repos);
    const availableLanguages = getDerivedAvailableLanguages(repos);

    const reposById: Record<string, SidebarDataRepo> = {};
    for (const r of repos) {
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

    let unreadAlerts = 0;
    try {
      await pipeline.ensureReady();
      const events = pipeline.getAlerts(userId);
      unreadAlerts = events.filter((e) => e.readAt === null).length;
    } catch {
      unreadAlerts = 0;
    }

    // Per-source counts for the sidebar count badges. Degrade to zeros
    // on cold data-store / read error so the sidebar still renders.
    let sourceCounts: SidebarSourceCounts;
    try {
      sourceCounts = await getSidebarSourceCounts();
    } catch {
      sourceCounts = emptySidebarSourceCounts();
    }

    return NextResponse.json(
      {
        categoryStats,
        metaCounts,
        availableLanguages,
        reposById,
        unreadAlerts,
        sourceCounts,
        trendingReposCount: repos.length,
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(errorEnvelope(message), { status: 500 });
  }
}
