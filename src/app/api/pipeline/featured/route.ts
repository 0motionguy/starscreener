// GET /api/pipeline/featured?limit=8&watched=id1,id2&metaFilter=breakouts
//
// Returns the ordered hero "Featured" cards for the terminal homepage.
// Parameters:
//   limit       integer 1-20 (default 8)
//   watched     comma-separated list of repo ids
//   metaFilter  one of "hot"|"breakouts"|"quiet-killers"|"new"|"discussed"|
//               "rank-climbers"|"fresh-releases"
//
// v1 reads from committed JSON (derived-repos) so the homepage renders on
// cold Vercel Lambdas. The full pipeline waterfall (HN featured, reason-
// backed rank climbers, fresh releases) requires the in-memory pipeline
// state which isn't available in prod.

import { NextRequest, NextResponse } from "next/server";
import { getDerivedRepos } from "@/lib/derived-repos";
import type { FeaturedCard, FeaturedLabel, MetaFilter, Repo } from "@/lib/types";

const KNOWN_META_FILTERS: ReadonlyArray<MetaFilter> = [
  "hot",
  "breakouts",
  "quiet-killers",
  "new",
  "discussed",
  "rank-climbers",
  "fresh-releases",
];

const MS_PER_DAY = 86_400_000;

export interface FeaturedResponse {
  cards: FeaturedCard[];
  generatedAt: string;
}

function computeDeltaPercent(repo: Repo): number {
  return (repo.starsDelta24h / Math.max(repo.stars, 1)) * 100;
}

function synthReason(label: FeaturedLabel, repo: Repo): string {
  switch (label) {
    case "NUMBER_ONE_TODAY":
      return `Leading today with +${repo.starsDelta24h.toLocaleString()} stars`;
    case "BREAKOUT":
      return `Breakout — momentum accelerating into the top tier`;
    case "RANK_CLIMBER":
      return `Climbing fast — now ranked #${repo.rank} overall`;
    case "HN_FEATURED":
      return `Featured on Hacker News front page in the last 24h`;
    case "FRESH_RELEASE":
      return repo.lastReleaseTag
        ? `Shipped ${repo.lastReleaseTag} recently`
        : `Fresh major release in the last 48h`;
    case "MOST_DISCUSSED":
      return `Most discussed — ${repo.mentionCount24h} mentions in 24h`;
    case "QUIET_KILLER":
      return `Quiet killer — steady sustained growth, no single spike`;
    case "WATCHED_MOVING":
      return `Watched & moving — ${repo.starsDelta7d >= 0 ? "+" : ""}${repo.starsDelta7d.toLocaleString()} stars in 7d`;
  }
}

function buildCard(
  repo: Repo,
  label: FeaturedLabel,
  labelDisplay: string,
): FeaturedCard {
  return {
    label,
    labelDisplay,
    repo,
    reason: synthReason(label, repo),
    deltaPercent: computeDeltaPercent(repo),
    rankDelta: null,
    sparkline: repo.sparklineData,
  };
}

function applyMetaFilter(repos: Repo[], filter: MetaFilter | null): Repo[] {
  if (!filter) return repos;
  const now = Date.now();
  switch (filter) {
    case "hot":
      return repos.filter((r) => r.movementStatus === "hot");
    case "breakouts":
      return repos.filter((r) => r.movementStatus === "breakout");
    case "quiet-killers":
      return repos.filter((r) => r.movementStatus === "quiet_killer");
    case "new":
      return repos.filter((r) => {
        const created = Date.parse(r.createdAt);
        if (!Number.isFinite(created)) return false;
        return now - created < 30 * MS_PER_DAY;
      });
    case "discussed":
      return repos.filter((r) => r.mentionCount24h > 0);
    case "rank-climbers":
      return repos.filter((r) => r.rank > 0 && r.rank <= 20);
    case "fresh-releases":
      return repos.filter((r) => {
        if (!r.lastReleaseAt) return false;
        const t = Date.parse(r.lastReleaseAt);
        if (!Number.isFinite(t)) return false;
        return now - t < 7 * MS_PER_DAY;
      });
  }
}

/**
 * Waterfall: pick the strongest signal we can find, fill remaining slots
 * from the momentum-sorted pool. Dedupes by repo id.
 */
function buildFeaturedCards(
  pool: Repo[],
  watchlistRepoIds: string[],
  limit: number,
): FeaturedCard[] {
  const seen = new Set<string>();
  const out: FeaturedCard[] = [];

  const push = (card: FeaturedCard | null) => {
    if (!card) return;
    if (seen.has(card.repo.id)) return;
    seen.add(card.repo.id);
    out.push(card);
  };

  // 1. #1 today — top starsDelta24h with positive movement.
  const byDelta24h = [...pool]
    .filter((r) => r.starsDelta24h > 0)
    .sort((a, b) => b.starsDelta24h - a.starsDelta24h);
  if (byDelta24h[0]) {
    push(buildCard(byDelta24h[0], "NUMBER_ONE_TODAY", "#1 TODAY"));
  }

  // 2. Breakouts — up to 2 different repos with movementStatus === 'breakout'.
  const breakouts = pool.filter((r) => r.movementStatus === "breakout");
  for (const r of breakouts.slice(0, 2)) {
    push(buildCard(r, "BREAKOUT", "BREAKOUT"));
  }

  // 3. Rank climbers — top-20 by momentum, not yet seen.
  const climbers = pool.filter((r) => r.rank > 0 && r.rank <= 20);
  if (climbers[0]) {
    push(buildCard(climbers[0], "RANK_CLIMBER", "RANK CLIMBER"));
  }

  // 4. Quiet killers — movementStatus === 'quiet_killer'.
  const quietKillers = pool.filter((r) => r.movementStatus === "quiet_killer");
  if (quietKillers[0]) {
    push(buildCard(quietKillers[0], "QUIET_KILLER", "QUIET KILLER"));
  }

  // 5. Watched & moving — repos in watchlistRepoIds with positive 7d delta.
  if (watchlistRepoIds.length > 0) {
    const watched = new Set(watchlistRepoIds);
    const watchedMoving = pool
      .filter((r) => watched.has(r.id) && r.starsDelta7d > 0)
      .sort((a, b) => b.starsDelta7d - a.starsDelta7d);
    if (watchedMoving[0]) {
      push(buildCard(watchedMoving[0], "WATCHED_MOVING", "WATCHED & MOVING"));
    }
  }

  // 6. Backfill with top movers by starsDelta24h (any positive), then
  //    momentum desc, until we hit the limit or exhaust the pool.
  for (const r of byDelta24h) {
    if (out.length >= limit) break;
    push(buildCard(r, "NUMBER_ONE_TODAY", "TOP MOVER"));
  }
  if (out.length < limit) {
    const byMomentum = [...pool].sort(
      (a, b) => b.momentumScore - a.momentumScore,
    );
    for (const r of byMomentum) {
      if (out.length >= limit) break;
      push(buildCard(r, "RANK_CLIMBER", "TRENDING"));
    }
  }

  return out.slice(0, limit);
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<FeaturedResponse | { error: string }>> {
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
    const allRepos = getDerivedRepos();
    const pool = applyMetaFilter(allRepos, metaFilter);
    const cards = buildFeaturedCards(pool, watchlistRepoIds, limit);

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
