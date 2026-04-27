// GET /api/pipeline/featured?limit=8&watched=id1,id2&metaFilter=breakouts
//
// Returns the ordered hero "Featured" cards for the terminal homepage.
// Parameters:
//   limit       integer 1-20 (default 8)
//   watched     comma-separated list of repo ids
//   metaFilter  one of "hot"|"breakouts"|"quiet-killers"|"new"|"discussed"|
//               "rank-climbers"|"fresh-releases"
//   tab         one of "trending"|"gainers"|"new"|"watchlisted"
//   timeRange   one of "24h"|"7d"|"30d"
//
// Reads from committed JSON so the homepage renders on cold lambdas.

import { NextRequest, NextResponse } from "next/server";
import { errorEnvelope } from "@/lib/api/error-response";
import { applyTerminalTabFilter, trendScoreForTimeRange } from "@/lib/filters";
import { getDerivedRepos } from "@/lib/derived-repos";
import type {
  FeaturedCard,
  FeaturedLabel,
  MetaFilter,
  Repo,
  TerminalTab,
  TimeRange,
} from "@/lib/types";

export const runtime = "nodejs";

const KNOWN_META_FILTERS: ReadonlyArray<MetaFilter> = [
  "hot",
  "breakouts",
  "quiet-killers",
  "new",
  "discussed",
  "rank-climbers",
  "fresh-releases",
];
const KNOWN_TABS: ReadonlyArray<TerminalTab> = [
  "trending",
  "gainers",
  "new",
  "watchlisted",
];
const KNOWN_TIME_RANGES: ReadonlyArray<TimeRange> = ["24h", "7d", "30d"];
const MS_PER_DAY = 86_400_000;

export interface FeaturedResponse {
  cards: FeaturedCard[];
  generatedAt: string;
}

function deltaForRange(repo: Repo, timeRange: TimeRange): number {
  switch (timeRange) {
    case "24h":
      return repo.starsDelta24h;
    case "7d":
      return repo.starsDelta7d;
    case "30d":
      return repo.starsDelta30d;
  }
}

function timeRangeLabel(timeRange: TimeRange): string {
  switch (timeRange) {
    case "24h":
      return "24H";
    case "7d":
      return "7D";
    case "30d":
      return "30D";
  }
}

function computeDeltaPercent(repo: Repo, timeRange: TimeRange): number {
  return (deltaForRange(repo, timeRange) / Math.max(repo.stars, 1)) * 100;
}

function synthReason(
  label: FeaturedLabel,
  repo: Repo,
  timeRange: TimeRange,
): string {
  const delta = deltaForRange(repo, timeRange);
  const window = timeRangeLabel(timeRange).toLowerCase();

  switch (label) {
    case "NUMBER_ONE_TODAY":
      return `Leading ${window} with +${delta.toLocaleString("en-US")} stars`;
    case "BREAKOUT":
      return "Breakout - momentum accelerating into the top tier";
    case "RANK_CLIMBER":
      return `Climbing fast - now ranked #${repo.rank} overall`;
    case "HN_FEATURED":
      return "Featured on Hacker News front page in the last 24h";
    case "FRESH_RELEASE":
      return repo.lastReleaseTag
        ? `Shipped ${repo.lastReleaseTag} recently`
        : "Fresh major release in the last 48h";
    case "MOST_DISCUSSED":
      return `Most discussed - ${repo.mentionCount24h} mentions in 24h`;
    case "QUIET_KILLER":
      return "Quiet killer - steady sustained growth, no single spike";
    case "WATCHED_MOVING":
      return `Watched and moving - ${delta >= 0 ? "+" : ""}${delta.toLocaleString("en-US")} stars in ${window}`;
  }
}

function buildCard(
  repo: Repo,
  label: FeaturedLabel,
  labelDisplay: string,
  timeRange: TimeRange,
): FeaturedCard {
  return {
    label,
    labelDisplay,
    repo,
    reason: synthReason(label, repo, timeRange),
    deltaPercent: computeDeltaPercent(repo, timeRange),
    rankDelta: null,
    sparkline: repo.sparklineData,
  };
}

function applyMetaFilter(repos: Repo[], filter: MetaFilter | null): Repo[] {
  if (!filter) return repos;
  const now = Date.now();

  switch (filter) {
    case "hot":
      return repos.filter((repo) => repo.movementStatus === "hot");
    case "breakouts":
      return repos.filter((repo) => repo.movementStatus === "breakout");
    case "quiet-killers":
      return repos.filter((repo) => repo.movementStatus === "quiet_killer");
    case "new":
      return repos.filter((repo) => {
        const createdAt = Date.parse(repo.createdAt);
        if (!Number.isFinite(createdAt)) return false;
        return now - createdAt < 30 * MS_PER_DAY;
      });
    case "discussed":
      return repos.filter((repo) => repo.mentionCount24h > 0);
    case "rank-climbers":
      return repos.filter((repo) => repo.rank > 0 && repo.rank <= 20);
    case "fresh-releases":
      return repos.filter((repo) => {
        if (!repo.lastReleaseAt) return false;
        const releaseAt = Date.parse(repo.lastReleaseAt);
        if (!Number.isFinite(releaseAt)) return false;
        return now - releaseAt < 7 * MS_PER_DAY;
      });
  }
}

function buildFeaturedCards(
  pool: Repo[],
  watchlistRepoIds: string[],
  limit: number,
  timeRange: TimeRange,
  activeTab: TerminalTab,
): FeaturedCard[] {
  const seen = new Set<string>();
  const out: FeaturedCard[] = [];

  const push = (card: FeaturedCard | null) => {
    if (!card) return;
    if (seen.has(card.repo.id)) return;
    seen.add(card.repo.id);
    out.push(card);
  };

  const byWindowDelta = [...pool]
    .filter((repo) => deltaForRange(repo, timeRange) > 0)
    .sort((a, b) => deltaForRange(b, timeRange) - deltaForRange(a, timeRange));
  const byTrendingScore = [...pool]
    .filter((repo) => trendScoreForTimeRange(repo, timeRange) > 0)
    .sort(
      (a, b) =>
        trendScoreForTimeRange(b, timeRange) - trendScoreForTimeRange(a, timeRange),
    );
  const primaryRanking =
    activeTab === "trending" && byTrendingScore.length > 0
      ? byTrendingScore
      : byWindowDelta;

  if (primaryRanking[0]) {
    push(
      buildCard(
        primaryRanking[0],
        "NUMBER_ONE_TODAY",
        `#1 ${timeRangeLabel(timeRange)}`,
        timeRange,
      ),
    );
  }

  const breakouts = pool.filter((repo) => repo.movementStatus === "breakout");
  for (const repo of breakouts.slice(0, 2)) {
    push(buildCard(repo, "BREAKOUT", "BREAKOUT", timeRange));
  }

  const climbers = pool.filter((repo) => repo.rank > 0 && repo.rank <= 20);
  if (climbers[0]) {
    push(buildCard(climbers[0], "RANK_CLIMBER", "RANK CLIMBER", timeRange));
  }

  const quietKillers = pool.filter(
    (repo) => repo.movementStatus === "quiet_killer",
  );
  if (quietKillers[0]) {
    push(buildCard(quietKillers[0], "QUIET_KILLER", "QUIET KILLER", timeRange));
  }

  if (watchlistRepoIds.length > 0) {
    const watched = new Set(watchlistRepoIds);
    const watchedMoving = pool
      .filter((repo) => watched.has(repo.id) && deltaForRange(repo, timeRange) > 0)
      .sort((a, b) => deltaForRange(b, timeRange) - deltaForRange(a, timeRange));
    if (watchedMoving[0]) {
      push(
        buildCard(
          watchedMoving[0],
          "WATCHED_MOVING",
          "WATCHED & MOVING",
          timeRange,
        ),
      );
    }
  }

  for (const repo of primaryRanking) {
    if (out.length >= limit) break;
    push(buildCard(repo, "NUMBER_ONE_TODAY", "TOP MOVER", timeRange));
  }

  if (out.length < limit) {
    const byMomentum = [...pool].sort(
      (a, b) => b.momentumScore - a.momentumScore,
    );
    for (const repo of byMomentum) {
      if (out.length >= limit) break;
      push(buildCard(repo, "RANK_CLIMBER", "TRENDING", timeRange));
    }
  }

  return out.slice(0, limit);
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<FeaturedResponse | { error: string }>> {
  const { searchParams } = request.nextUrl;

  const limitParam = searchParams.get("limit");
  let limit = 8;
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return NextResponse.json(errorEnvelope("limit must be an integer"), { status: 400 });
    }
    if (parsed < 1 || parsed > 20) {
      return NextResponse.json(errorEnvelope("limit must be between 1 and 20"), { status: 400 });
    }
    limit = parsed;
  }

  const watchedParam = searchParams.get("watched");
  const watchlistRepoIds = watchedParam
    ? watchedParam
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  const metaFilterParam = searchParams.get("metaFilter");
  let metaFilter: MetaFilter | null = null;
  if (metaFilterParam !== null && metaFilterParam !== "") {
    if (!KNOWN_META_FILTERS.includes(metaFilterParam as MetaFilter)) {
      return NextResponse.json(
        errorEnvelope(
          `metaFilter must be one of: ${KNOWN_META_FILTERS.join(", ")}`,
        ),
        { status: 400 },
      );
    }
    metaFilter = metaFilterParam as MetaFilter;
  }

  const tabParam = searchParams.get("tab") ?? "trending";
  if (!KNOWN_TABS.includes(tabParam as TerminalTab)) {
    return NextResponse.json(
      errorEnvelope(`tab must be one of: ${KNOWN_TABS.join(", ")}`),
      { status: 400 },
    );
  }
  const activeTab = tabParam as TerminalTab;

  const timeRangeParam = searchParams.get("timeRange") ?? "7d";
  if (!KNOWN_TIME_RANGES.includes(timeRangeParam as TimeRange)) {
    return NextResponse.json(
      errorEnvelope(
        `timeRange must be one of: ${KNOWN_TIME_RANGES.join(", ")}`,
      ),
      { status: 400 },
    );
  }
  const timeRange = timeRangeParam as TimeRange;

  try {
    const allRepos = getDerivedRepos();
    const metaFiltered = applyMetaFilter(allRepos, metaFilter);
    const pool = applyTerminalTabFilter(
      metaFiltered,
      activeTab,
      watchlistRepoIds,
    );
    const cards = buildFeaturedCards(
      pool,
      watchlistRepoIds,
      limit,
      timeRange,
      activeTab,
    );

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
    return NextResponse.json(errorEnvelope(message), { status: 500 });
  }
}
