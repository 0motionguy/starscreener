import { NextResponse } from "next/server";
import { pipeline } from "@/lib/pipeline/pipeline";
import { CATEGORIES } from "@/lib/constants";
import type { Category } from "@/lib/types";
import { READ_CACHE_HEADERS } from "@/lib/api/cache";

export async function GET() {
  await pipeline.ensureReady();
  // Pull live per-category rollups from the pipeline (repoCount, avgMomentum,
  // topMoverId) and merge with the static name/icon/color/description metadata.
  const stats = pipeline.getCategoryStats();
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

  return NextResponse.json(
    { categories },
    { headers: READ_CACHE_HEADERS },
  );
}
