import { NextRequest, NextResponse } from "next/server";
import type { Repo } from "@/lib/types";
import type { TrendFilter, TrendWindow } from "@/lib/pipeline/types";
import { slugToId } from "@/lib/utils";
import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import {
  getDerivedRepoById,
  getDerivedRepos,
} from "@/lib/derived-repos";

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

function deltaForWindow(repo: Repo, window: TrendWindow): number {
  switch (window) {
    case "today":
      return repo.starsDelta24h;
    case "week":
      return repo.starsDelta7d;
    case "month":
      return repo.starsDelta30d;
  }
}

function sortRepos(repos: Repo[], sort: SortKey, window: TrendWindow): Repo[] {
  const sorted = [...repos];
  switch (sort) {
    case "momentum":
      // Momentum default additionally pre-orders by the requested window's
      // delta so ties in the global momentumScore break consistently with
      // the caller's time-window intent.
      sorted.sort((a, b) => {
        const d = b.momentumScore - a.momentumScore;
        if (d !== 0) return d;
        return deltaForWindow(b, window) - deltaForWindow(a, window);
      });
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
    // or the fullName ("vercel/next.js") — both resolve.
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
      const repo = getDerivedRepoById(id);
      if (repo) repos.push(repo);
      else missing.push(rawIds[i]);
    }
    return NextResponse.json(
      {
        repos,
        meta: {
          total: repos.length,
          requested: rawIds.length,
          missing,
        },
      },
      { headers: READ_CACHE_HEADERS },
    );
  }

  const periodParam = searchParams.get("period") ?? "week";
  const filterParam = searchParams.get("filter") ?? "all";
  const category = searchParams.get("category") ?? null;
  const sortParam = (searchParams.get("sort") ?? "momentum") as SortKey;
  const tagParam = searchParams.get("tag");
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit")) || 25, 1),
    100,
  );
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

  // Strict param validation: unknown sort/filter/period/tag return 400
  // rather than silently defaulting, so typos and stale bookmarks surface
  // instead of hiding behind a misleading response.
  const validSorts: SortKey[] = [
    "momentum",
    "stars-today",
    "stars-total",
    "newest",
  ];
  if (!validSorts.includes(sortParam)) {
    return NextResponse.json(
      { error: `Invalid sort: ${sortParam}`, valid: validSorts },
      { status: 400 },
    );
  }
  if (!VALID_PERIODS.has(periodParam as TrendWindow)) {
    return NextResponse.json(
      {
        error: `Invalid period: ${periodParam}`,
        valid: Array.from(VALID_PERIODS),
      },
      { status: 400 },
    );
  }
  if (!VALID_FILTERS.has(filterParam as TrendFilter)) {
    return NextResponse.json(
      {
        error: `Invalid filter: ${filterParam}`,
        valid: Array.from(VALID_FILTERS),
      },
      { status: 400 },
    );
  }
  const sort: SortKey = sortParam;
  const period: TrendWindow = periodParam as TrendWindow;
  const filter: TrendFilter = filterParam as TrendFilter;

  // P9: read from committed JSON rather than the in-memory repoStore —
  // the store is empty on cold Vercel Lambdas, so the previous
  // pipeline.getTopMovers / getCategoryMovers path served 0 repos in prod.
  const all = getDerivedRepos();

  // Scope to category (if requested), then apply the filter preset.
  let candidates: Repo[] = category
    ? all.filter((r) => r.categoryId === category)
    : all;
  candidates = applyLocalFilter(candidates, filter);

  // Optional tag filter (additive). Rejects empty/invalid input with 400.
  if (tagParam !== null) {
    const tag = tagParam.trim().toLowerCase();
    if (!tag || !/^[a-z0-9-]+$/.test(tag)) {
      return NextResponse.json(
        { error: `Invalid tag: ${tagParam}` },
        { status: 400 },
      );
    }
    candidates = candidates.filter(
      (r) => Array.isArray(r.tags) && r.tags.includes(tag),
    );
  }

  const total = candidates.length;

  // Apply requested sort.
  const sorted = sortRepos(candidates, sort, period);

  // Paginate
  const page = sorted.slice(offset, offset + limit);

  return NextResponse.json(
    {
      repos: page,
      meta: {
        total,
        limit,
        offset,
        period: periodParam,
        filter: filterParam,
      },
    },
    { headers: READ_CACHE_HEADERS },
  );
}
