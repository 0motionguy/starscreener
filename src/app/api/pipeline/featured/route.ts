// GET /api/pipeline/featured?limit=8&watched=id1,id2&metaFilter=breakouts
//
// Returns the ordered hero "Featured" cards for the terminal homepage.
// Parameters:
//   limit       integer 1-20 (default 8)
//   watched     comma-separated list of repo ids
//   metaFilter  one of "hot"|"breakouts"|"quiet-killers"|"new"|"discussed"|
//               "rank-climbers"|"fresh-releases"

import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@/lib/pipeline/pipeline";
import type { FeaturedCard, MetaFilter } from "@/lib/types";

const KNOWN_META_FILTERS: ReadonlyArray<MetaFilter> = [
  "hot",
  "breakouts",
  "quiet-killers",
  "new",
  "discussed",
  "rank-climbers",
  "fresh-releases",
];

export interface FeaturedResponse {
  cards: FeaturedCard[];
  generatedAt: string;
}

export async function GET(
  request: NextRequest,
): Promise<
  NextResponse<FeaturedResponse | { error: string }>
> {
  const { searchParams } = request.nextUrl;

  // limit: default 8, clamped to [1, 20]. Reject non-numeric explicitly.
  const limitParam = searchParams.get("limit");
  let limit = 8;
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return NextResponse.json(
        { error: "limit must be an integer" },
        { status: 400 },
      );
    }
    if (parsed < 1 || parsed > 20) {
      return NextResponse.json(
        { error: "limit must be between 1 and 20" },
        { status: 400 },
      );
    }
    limit = parsed;
  }

  // watched: comma-separated ids → array.
  const watchedParam = searchParams.get("watched");
  const watchlistRepoIds = watchedParam
    ? watchedParam
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];

  // metaFilter: optional, must be from KNOWN_META_FILTERS.
  const metaFilterParam = searchParams.get("metaFilter");
  let metaFilter: MetaFilter | null = null;
  if (metaFilterParam !== null && metaFilterParam !== "") {
    if (!KNOWN_META_FILTERS.includes(metaFilterParam as MetaFilter)) {
      return NextResponse.json(
        {
          error: `metaFilter must be one of: ${KNOWN_META_FILTERS.join(", ")}`,
        },
        { status: 400 },
      );
    }
    metaFilter = metaFilterParam as MetaFilter;
  }

  try {
    await pipeline.ensureReady();
    const cards = pipeline.getFeaturedTrending({
      limit,
      watchlistRepoIds,
      metaFilter,
    });

    return NextResponse.json(
      {
        cards,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
