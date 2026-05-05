import { NextResponse } from "next/server";
import { CATEGORIES } from "@/lib/constants";
import { getDerivedCategoryStats } from "@/lib/derived-insights";
import type { Category } from "@/lib/types";
import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import { respondWithSizeGuard } from "@/lib/api/response-size";
import { refreshTrendingFromStore } from "@/lib/trending";
import { refreshRecentReposFromStore } from "@/lib/recent-repos";
import { refreshRepoMetadataFromStore } from "@/lib/repo-metadata";

export const runtime = "nodejs";

export async function GET() {
  await Promise.all([
    refreshTrendingFromStore(),
    refreshRecentReposFromStore(),
    refreshRepoMetadataFromStore(),
  ]);

  const stats = getDerivedCategoryStats();
  const statsById = new Map(stats.map((s) => [s.categoryId, s]));

  const categories: Category[] = CATEGORIES.map((cat) => {
    const s = statsById.get(cat.id);
    return {
      ...cat,
      repoCount: s?.repoCount ?? 0,
      avgMomentum: s?.avgMomentum ?? 0,
      topMoverId: s?.topMoverId ?? null,
    };
  });

  return respondWithSizeGuard(
    { categories },
    {
      headers: READ_CACHE_HEADERS,
      route: "/api/categories",
      arrayKeys: ["categories"],
    },
  );
}
