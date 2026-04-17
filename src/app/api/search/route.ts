import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@/lib/pipeline/pipeline";
import type { Repo } from "@/lib/types";
import { READ_CACHE_HEADERS } from "@/lib/api/cache";

type SearchSort = "momentum" | "stars-today" | "stars-total";

function sortResults(repos: Repo[], sort: SearchSort): Repo[] {
  const sorted = [...repos];
  switch (sort) {
    case "momentum":
      sorted.sort((a, b) => b.momentumScore - a.momentumScore);
      break;
    case "stars-today":
      sorted.sort((a, b) => b.starsDelta24h - a.starsDelta24h);
      break;
    case "stars-total":
      sorted.sort((a, b) => b.stars - a.stars);
      break;
  }
  return sorted;
}

export async function GET(request: NextRequest) {
  await pipeline.ensureReady();
  const { searchParams } = request.nextUrl;

  const query = searchParams.get("q") ?? "";
  const category = searchParams.get("category");
  const sortParam = (searchParams.get("sort") ?? "momentum") as SearchSort;
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit")) || 20, 1),
    100,
  );

  // Validate sort — strict: unknown sort returns 400 rather than silently
  // defaulting (surface typos instead of masking them).
  const validSorts: SearchSort[] = ["momentum", "stars-today", "stars-total"];
  if (!validSorts.includes(sortParam)) {
    return NextResponse.json(
      { error: `Invalid sort: ${sortParam}`, valid: validSorts },
      { status: 400 },
    );
  }
  const sort: SearchSort = sortParam;

  // Empty query returns empty results (not an error)
  if (!query.trim()) {
    return NextResponse.json(
      {
        results: [],
        meta: { total: 0, query: "", limit },
      },
      { headers: READ_CACHE_HEADERS },
    );
  }

  // Delegate to pipeline — it owns fullName/description/topics match + live
  // momentumScore ordering.
  const raw = pipeline.searchReposByQuery(query, {
    categoryId: category ?? undefined,
  });

  const total = raw.length;

  // Apply requested sort (overrides pipeline's default momentum-desc when
  // the user explicitly picked stars-today or stars-total).
  const sorted = sortResults(raw, sort);

  // Limit
  const results = sorted.slice(0, limit);

  return NextResponse.json(
    {
      results,
      meta: { total, query, limit },
    },
    { headers: READ_CACHE_HEADERS },
  );
}
