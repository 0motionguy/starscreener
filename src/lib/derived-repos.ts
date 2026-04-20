// Build a fully-assembled Repo[] entirely from committed JSON
// (data/trending.json + data/deltas.json). Used by surfaces that run on cold
// Vercel Lambdas where the in-memory repoStore is empty.
//
// Cached once per process because both source files are static at runtime —
// they ship with the build, so second-and-later calls are a no-op.
//
// Scope: discovery + search surfaces (homepage, /api/search, /api/repos,
// compare + category OG cards). MCP tools + admin pipeline routes continue
// to read the in-memory stores.

import type { Repo } from "./types";
import { slugToId } from "./utils";
import {
  buildBaseRepoFromRecent,
  getRecentRepos,
} from "./recent-repos";
import {
  assembleRepoFromTrending,
  getDeltas,
  getTrending,
  lastFetchedAt,
  type DeltaValue,
  type TrendingLanguage,
  type TrendingPeriod,
  type TrendingRow,
} from "./trending";
import { scoreBatch } from "./pipeline/scoring/engine";
import {
  classifyBatch,
  deriveTags,
} from "./pipeline/classification/classifier";

let _cache: Repo[] | null = null;
let _byFullName: Map<string, Repo> | null = null;
let _byId: Map<string, Repo> | null = null;

const PERIODS: TrendingPeriod[] = [
  "past_24_hours",
  "past_week",
  "past_month",
];
const LANGS: TrendingLanguage[] = ["All", "Python", "TypeScript", "Rust", "Go"];

interface TrendingRepoAggregate {
  row: TrendingRow;
  stars24h: number;
  stars7d: number;
  stars30d: number;
  trendScore24h: number;
  trendScore7d: number;
  trendScore30d: number;
  activityStars: number;
  forks: number;
  contributors: number;
  has24h: boolean;
  has7d: boolean;
  has30d: boolean;
  collectionNames: Set<string>;
}

function parseMetric(value: string | null | undefined): number {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseScore(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function contributorCount(row: TrendingRow): number {
  return row.contributor_logins
    ? row.contributor_logins.split(",").filter(Boolean).length
    : 0;
}

function parseCollectionNames(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * Synthesize a 14-point daily sparkline from known deltas + stars_now.
 *
 * Anchors: today = stars_now, -1d = stars_now - delta_24h, -7d = stars_now -
 * delta_7d, -30d shrunk to -13d proportionally so the curve stays in the
 * visible 14-day window. Intermediate days are linearly interpolated. This
 * is a cold-start-friendly stand-in for real snapshot history; once the
 * in-memory snapshotter accumulates real datapoints those override.
 */
function synthesizeSparkline(
  starsNow: number,
  delta24h: number,
  delta7d: number,
  delta30d: number,
): number[] {
  if (starsNow <= 0) return [];

  // Anchor points keyed by days-ago (0 = today).
  const anchors = new Map<number, number>();
  anchors.set(0, starsNow);
  anchors.set(1, Math.max(0, starsNow - Math.max(0, delta24h)));
  anchors.set(7, Math.max(0, starsNow - Math.max(0, delta7d)));
  // Compress 30d onto the 13-days-ago slot so the curve shows the longer-term
  // slope within a 14-point window without requiring 30 data points.
  const delta13d = Math.round(delta30d * (13 / 30));
  anchors.set(13, Math.max(0, starsNow - Math.max(0, delta13d)));

  const sortedKeys = Array.from(anchors.keys()).sort((a, b) => a - b);

  const series: number[] = [];
  for (let day = 13; day >= 0; day--) {
    // Find surrounding anchors for linear interpolation.
    let lower = sortedKeys[0];
    let upper = sortedKeys[sortedKeys.length - 1];
    for (const k of sortedKeys) {
      if (k <= day) lower = k;
      if (k >= day) {
        upper = k;
        break;
      }
    }
    const lo = anchors.get(lower)!;
    const hi = anchors.get(upper)!;
    if (lower === upper) {
      series.push(lo);
    } else {
      const t = (day - lower) / (upper - lower);
      series.push(Math.round(lo + (hi - lo) * t));
    }
  }
  return series;
}

function setPeriodMetrics(
  aggregate: TrendingRepoAggregate,
  period: TrendingPeriod,
  stars: number,
  totalScore: number,
): void {
  if (period === "past_24_hours") {
    aggregate.stars24h = Math.max(aggregate.stars24h, stars);
    aggregate.trendScore24h = Math.max(aggregate.trendScore24h, totalScore);
    aggregate.has24h = true;
  } else if (period === "past_week") {
    aggregate.stars7d = Math.max(aggregate.stars7d, stars);
    aggregate.trendScore7d = Math.max(aggregate.trendScore7d, totalScore);
    aggregate.has7d = true;
  } else if (period === "past_month") {
    aggregate.stars30d = Math.max(aggregate.stars30d, stars);
    aggregate.trendScore30d = Math.max(aggregate.trendScore30d, totalScore);
    aggregate.has30d = true;
  }
}

function buildTrendingAggregates(): Map<string, TrendingRepoAggregate> {
  const aggregates = new Map<string, TrendingRepoAggregate>();

  for (const period of PERIODS) {
    for (const lang of LANGS) {
      for (const row of getTrending(period, lang)) {
        if (!row.repo_name || !row.repo_name.includes("/")) continue;

        const stars = parseMetric(row.stars);
        const totalScore = parseScore(row.total_score);
        const forks = parseMetric(row.forks);
        const contributors = contributorCount(row);
        const collectionNames = parseCollectionNames(row.collection_names);

        let aggregate = aggregates.get(row.repo_name);
        if (!aggregate) {
          aggregate = {
            row,
            stars24h: 0,
            stars7d: 0,
            stars30d: 0,
            trendScore24h: 0,
            trendScore7d: 0,
            trendScore30d: 0,
            activityStars: 0,
            forks: 0,
            contributors: 0,
            has24h: false,
            has7d: false,
            has30d: false,
            collectionNames: new Set(collectionNames),
          };
          aggregates.set(row.repo_name, aggregate);
        } else if (
          (!aggregate.row.description && row.description) ||
          (!aggregate.row.primary_language && row.primary_language)
        ) {
          aggregate.row = { ...aggregate.row, ...row };
        }

        setPeriodMetrics(aggregate, period, stars, totalScore);
        aggregate.activityStars = Math.max(aggregate.activityStars, stars);
        aggregate.forks = Math.max(aggregate.forks, forks);
        aggregate.contributors = Math.max(aggregate.contributors, contributors);
        for (const name of collectionNames) aggregate.collectionNames.add(name);
      }
    }
  }

  return aggregates;
}

/**
 * Build a best-effort base Repo from aggregated OSS Insight rows. The trending
 * feed doesn't carry topics / createdAt / lastReleaseAt / openIssues, so
 * those fall back to safe zero / empty values. `lastCommitAt` is set to
 * the trending fetch timestamp — appearing in OSS Insight's trending list
 * implies recent activity, so this is a reasonable floor that avoids
 * zeroing out every repo's commit-freshness score.
 */
function baseRepoFromTrending(
  aggregate: TrendingRepoAggregate,
  fetchedAt: string,
): Repo {
  const row = aggregate.row;
  const parts = row.repo_name.split("/");
  const owner = parts[0] ?? "";
  const name = parts[1] ?? row.repo_name;
  return {
    id: slugToId(row.repo_name),
    fullName: row.repo_name,
    name,
    owner,
    ownerAvatarUrl: owner ? `https://github.com/${owner}.png` : "",
    description: row.description ?? "",
    url: `https://github.com/${row.repo_name}`,
    language: row.primary_language || null,
    topics: [],
    categoryId: "other",
    stars: aggregate.activityStars,
    forks: aggregate.forks,
    contributors: aggregate.contributors,
    openIssues: 0,
    lastCommitAt: fetchedAt,
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "",
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    trendScore24h: 0,
    trendScore7d: 0,
    trendScore30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore: 0,
    movementStatus: "stable",
    rank: 0,
    categoryRank: 0,
    sparklineData: [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
    tags: [],
    collectionNames: Array.from(aggregate.collectionNames).sort(),
  };
}

/**
 * Fully-assembled Repo[] built from committed JSON. Runs classify → score →
 * rank in one pass so consumers get the same shape that the in-memory
 * pipeline would have produced after recomputeAll(). Cached after the first
 * call.
 */
export function getDerivedRepos(): Repo[] {
  if (_cache) return _cache;

  const aggregates = buildTrendingAggregates();
  const deltas = getDeltas();
  const fetchedAt = lastFetchedAt;

  // repoId → stars_now lookup for authoritative cumulative totals.
  const starsNowByRepoId = new Map<string, number>();
  for (const [repoId, entry] of Object.entries(deltas.repos)) {
    starsNowByRepoId.set(repoId, entry.stars_now);
  }

  const isRealDelta = (d: DeltaValue | undefined): boolean =>
    !!d && d.value !== null && d.basis !== "cold-start";

  let repos: Repo[] = [];

  for (const aggregate of aggregates.values()) {
    const base = baseRepoFromTrending(aggregate, fetchedAt);
    const id = slugToId(aggregate.row.repo_name);

    const repoIdLookup = aggregate.row.repo_id;
    const starsNow =
      (repoIdLookup && starsNowByRepoId.get(repoIdLookup)) || 0;
    const deltaEntry = repoIdLookup ? deltas.repos[repoIdLookup] : undefined;

    const mergeDelta = (
      primary: number,
      hasPrimary: boolean,
      fallback: DeltaValue | undefined,
    ): { value: number; missing: boolean } => {
      if (hasPrimary) return { value: primary, missing: false };
      if (isRealDelta(fallback)) {
        return { value: fallback!.value as number, missing: false };
      }
      return { value: 0, missing: true };
    };

    const d24 = mergeDelta(
      aggregate.stars24h,
      aggregate.has24h,
      deltaEntry?.delta_24h,
    );
    const d7 = mergeDelta(
      aggregate.stars7d,
      aggregate.has7d,
      deltaEntry?.delta_7d,
    );
    const d30 = mergeDelta(
      aggregate.stars30d,
      aggregate.has30d,
      deltaEntry?.delta_30d,
    );
    const starsTotal = starsNow > 0 ? starsNow : aggregate.activityStars;

    const enrichedBase: Repo = {
      ...base,
      id,
      stars: starsTotal,
      sparklineData: [],
      collectionNames: Array.from(aggregate.collectionNames).sort(),
    };
    const withHistory = assembleRepoFromTrending(enrichedBase, deltas);

    // Prefer real snapshot-derived sparkline when the pipeline provided one;
    // otherwise synthesize a credible 14-point curve from the anchor deltas.
    // For synthesis we accept cold-start raw values (numbers only — nulls and
    // repo-not-tracked fall back to 0), because even diagnostic partial-window
    // numbers produce a more useful visual curve than a flat dotted line.
    const rawDelta = (d: DeltaValue | undefined): number => {
      if (!d || d.value === null) return 0;
      return d.value;
    };
    const realSparkline = Array.isArray(withHistory.sparklineData)
      ? withHistory.sparklineData
      : [];
    const sparkline =
      realSparkline.length >= 7
        ? realSparkline
        : synthesizeSparkline(
            starsTotal,
            aggregate.has24h ? aggregate.stars24h : rawDelta(deltaEntry?.delta_24h),
            aggregate.has7d ? aggregate.stars7d : rawDelta(deltaEntry?.delta_7d),
            aggregate.has30d ? aggregate.stars30d : rawDelta(deltaEntry?.delta_30d),
          );

    repos.push({
      ...withHistory,
      id,
      stars: starsTotal,
      forks: aggregate.forks,
      contributors: aggregate.contributors,
      starsDelta24h: d24.value,
      starsDelta7d: d7.value,
      starsDelta30d: d30.value,
      trendScore24h: aggregate.trendScore24h,
      trendScore7d: aggregate.trendScore7d,
      trendScore30d: aggregate.trendScore30d,
      sparklineData: sparkline,
      hasMovementData: !(d24.missing && d7.missing && d30.missing),
      starsDelta24hMissing: d24.missing,
      starsDelta7dMissing: d7.missing,
      starsDelta30dMissing: d30.missing,
    });
  }

  // Supplemental: freshly discovered repos from data/recent-repos.json that
  // aren't yet in the trending feed. These have no enrichment beyond what the
  // recent-repos list carries; we give them zero deltas and empty sparkline.
  const seenFullNames = new Set(
    repos.map((repo) => repo.fullName.toLowerCase()),
  );
  for (const row of getRecentRepos()) {
    const normalized = row.fullName.toLowerCase();
    if (seenFullNames.has(normalized)) continue;
    const base = buildBaseRepoFromRecent(row);
    repos.push({
      ...base,
      sparklineData: [],
    });
    seenFullNames.add(normalized);
  }

  // 2. Classify first so scoreBatch's per-category averages use the real
  //    topic-derived categoryIds instead of the "other" placeholder.
  const classifications = classifyBatch(repos);
  repos = repos.map((r, i) => ({
    ...r,
    categoryId: classifications[i].primary.categoryId,
    tags: deriveTags(r),
  }));

  // 3. Score in one pass so per-category averages are consistent.
  const scores = scoreBatch(repos);
  repos = repos.map((r, i) => ({
    ...r,
    momentumScore: scores[i].overall,
    movementStatus: scores[i].movementStatus,
  }));

  // 4. Rank by momentum desc, tracking per-category position.
  const sorted = [...repos].sort((a, b) => b.momentumScore - a.momentumScore);
  const perCatCounter = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const catIdx = (perCatCounter.get(r.categoryId) ?? 0) + 1;
    perCatCounter.set(r.categoryId, catIdx);
    sorted[i] = {
      ...r,
      rank: i + 1,
      categoryRank: catIdx,
    };
  }

  _cache = sorted;
  return sorted;
}

/** Case-insensitive lookup by `owner/name`. */
export function getDerivedRepoByFullName(fullName: string): Repo | null {
  if (!_byFullName) {
    _byFullName = new Map();
    for (const r of getDerivedRepos()) {
      _byFullName.set(r.fullName.toLowerCase(), r);
    }
  }
  return _byFullName.get(fullName.toLowerCase()) ?? null;
}

/** Lookup by slug id (e.g. `vercel--next-js`). */
export function getDerivedRepoById(id: string): Repo | null {
  if (!_byId) {
    _byId = new Map();
    for (const r of getDerivedRepos()) {
      _byId.set(r.id, r);
    }
  }
  return _byId.get(id) ?? null;
}

/** Track count for pagination/debug across OSS + supplemental recent repos. */
export function getDerivedRepoCount(): number {
  return getDerivedRepos().length;
}

// Test-only cache reset.
export function __resetDerivedReposCache(): void {
  _cache = null;
  _byFullName = null;
  _byId = null;
}
