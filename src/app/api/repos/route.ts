import { NextRequest, NextResponse } from "next/server";
import { pipeline, repoStore } from "@/lib/pipeline/pipeline";
import type { Repo } from "@/lib/types";
import type { TrendFilter, TrendWindow } from "@/lib/pipeline/types";
import { slugToId } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Param validation
// ---------------------------------------------------------------------------

const VALID_PERIODS = new Set<TrendWindow>(["today", "week", "month"]);
const VALID_FILTERS = new Set<TrendFilter>([
  "all",
  "breakouts",
  "quiet-killers",
  "hot",
  "new-under-30d",
  "under-1k-stars",
]);

const MS_PER_DAY = 86_400_000;

type SortKey = "momentum" | "stars-today" | "stars-total" | "newest";

function sortRepos(repos: Repo[], sort: SortKey): Repo[] {
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
    case "newest":
      sorted.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      break;
  }
  return sorted;
}

// Mirrors pipeline's applyTrendFilter so category-scoped lookups can accept
// the same preset filter the top-movers query supports.
function applyLocalFilter(repos: Repo[], filter: TrendFilter): Repo[] {
  if (filter === "all") return repos;
  if (filter === "breakouts") {
    return repos.filter((r) => r.movementStatus === "breakout");
  }
  if (filter === "quiet-killers") {
    return repos.filter((r) => r.movementStatus === "quiet_killer");
  }
  if (filter === "hot") {
    return repos.filter((r) => r.movementStatus === "hot");
  }
  if (filter === "new-under-30d") {
    const now = Date.now();
    return repos.filter((r) => {
      const created = Date.parse(r.createdAt);
      if (!Number.isFinite(created)) return false;
      return now - created < 30 * MS_PER_DAY;
    });
  }
  if (filter === "under-1k-stars") {
    return repos.filter((r) => r.stars < 1000);
  }
  return repos;
}

export async function GET(request: NextRequest) {
  await pipeline.ensureReady();
  const { searchParams } = request.nextUrl;

  // Direct-id lookup path — ?ids=a,b,c returns the corresponding Repo
  // objects (in the requested order, missing ids silently dropped) without
  // running the trend/filter/sort pipeline. Used by the watchlist page and
  // the compare selector to resolve known repo IDs to full metadata in one
  // round-trip.
  const idsParam = searchParams.get("ids");
  if (idsParam !== null) {
    const rawIds = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // Normalize each input through the same slugifier the ingest path uses.
    // This lets callers pass either the canonical slug ("vercel--next-js")
    // or the fullName ("vercel/next.js") — both resolve. Fixes a silent
    // miss where dots in the input weren't collapsed to hyphens.
    const normalized = rawIds.map((raw) =>
      raw.includes("/") || raw.includes(".") ? slugToId(raw) : raw,
    );
    const seen = new Set<string>();
    const repos: Repo[] = [];
    const missing: string[] = [];
    for (let i = 0; i < normalized.length; i++) {
      const id = normalized[i];
      if (seen.has(id)) continue;
      seen.add(id);
      const repo = repoStore.get(id);
      if (repo) repos.push(repo);
      else missing.push(rawIds[i]);
    }
    return NextResponse.json({
      repos,
      meta: {
        total: repos.length,
        requested: rawIds.length,
        missing,
      },
    });
  }

  const periodParam = searchParams.get("period") ?? "week";
  const filterParam = searchParams.get("filter") ?? "all";
  const category = searchParams.get("category") ?? null;
  const sortParam = (searchParams.get("sort") ?? "momentum") as SortKey;
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit")) || 25, 1),
    100,
  );
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

  // Validate sort
  const validSorts: SortKey[] = [
    "momentum",
    "stars-today",
    "stars-total",
    "newest",
  ];
  const sort: SortKey = validSorts.includes(sortParam) ? sortParam : "momentum";

  // Normalize period/filter against the pipeline's shapes
  const period: TrendWindow = VALID_PERIODS.has(periodParam as TrendWindow)
    ? (periodParam as TrendWindow)
    : "week";
  const filter: TrendFilter = VALID_FILTERS.has(filterParam as TrendFilter)
    ? (filterParam as TrendFilter)
    : "all";

  // Pull the full candidate set from the pipeline so we can apply our own
  // sort + pagination. The pipeline already ran recompute during
  // ensureSeeded, so momentumScore/movementStatus/deltas are live values.
  let candidates: Repo[];
  if (category) {
    // Category-scoped: pipeline.getCategoryMovers doesn't take a filter
    // preset, so we pull the full list for the category and apply the
    // same filter locally for consistency with the global path.
    const all = pipeline.getCategoryMovers(category, period, 1000);
    candidates = applyLocalFilter(all, filter);
  } else {
    // Global: let the pipeline apply the trend filter directly.
    candidates = pipeline.getTopMovers(period, 1000, filter);
  }

  const total = candidates.length;

  // Apply requested sort (may override the pipeline's delta-desc default).
  const sorted = sortRepos(candidates, sort);

  // Paginate
  const page = sorted.slice(offset, offset + limit);

  return NextResponse.json({
    repos: page,
    meta: {
      total,
      limit,
      offset,
      period: periodParam,
      filter: filterParam,
    },
  });
}
