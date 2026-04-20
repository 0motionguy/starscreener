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
  assembleRepoFromTrending,
  getAllFullNames,
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

function setPeriodStars(
  aggregate: TrendingRepoAggregate,
  period: TrendingPeriod,
  stars: number,
): void {
  if (period === "past_24_hours") {
    aggregate.stars24h = Math.max(aggregate.stars24h, stars);
    aggregate.has24h = true;
  } else if (period === "past_week") {
    aggregate.stars7d = Math.max(aggregate.stars7d, stars);
    aggregate.has7d = true;
  } else if (period === "past_month") {
    aggregate.stars30d = Math.max(aggregate.stars30d, stars);
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

        setPeriodStars(aggregate, period, stars);
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

  // One aggregate per unique owner/name, taking the max period metric across
  // duplicate All/language buckets. OSS Insight's `row.stars` inside a bucket
  // is the stars-gained-in-period (a real delta), not the cumulative total —
  // the cumulative total lives in data/deltas.json as `stars_now`.
  const aggregates = buildTrendingAggregates();

  const deltas = getDeltas();
  const fetchedAt = lastFetchedAt;

  // repoId → stars_now lookup, so we can set Repo.stars to the cumulative
  // total (deltas.json) rather than the period-delta found in trending.json.
  const starsNowByRepoId = new Map<string, number>();
  for (const [repoId, entry] of Object.entries(deltas.repos)) {
    starsNowByRepoId.set(repoId, entry.stars_now);
  }

  // 1. Base Repo[]. Deltas come from two sources:
  //    a) OSS Insight period delta from `aggregate.stars{24h,7d,30d}` —
  //       real single-bucket numbers from the upstream trending feed.
  //       This is the PRIMARY source because OSS Insight's pre-computed
  //       period aggregates are the canonical upstream trend signal.
  //    b) data/deltas.json — git-history-derived. Used as a secondary
  //       fallback when (a) is missing for a given window AND (b) has
  //       a real (non-cold-start) value. This mostly fires for repos
  //       we track but that dropped out of OSS Insight's trending
  //       bucket for one window.
  //    We read `deltas.repos[repoId]` directly instead of the projected
  //    `starsDelta*Missing` flags because those fold the 1h-as-24h
  //    fallback into their semantics — which conflates with our source
  //    selection here.
  const isRealDelta = (d: DeltaValue | undefined): boolean =>
    !!d && d.value !== null && d.basis !== "cold-start";

  let repos: Repo[] = [];
  for (const aggregate of aggregates.values()) {
    const base = baseRepoFromTrending(aggregate, fetchedAt);
    const withHistory = assembleRepoFromTrending(base, deltas);
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

    repos.push({
      ...withHistory,
      id,
      stars: starsNow > 0 ? starsNow : aggregate.activityStars,
      forks: aggregate.forks,
      contributors: aggregate.contributors,
      starsDelta24h: d24.value,
      starsDelta7d: d7.value,
      starsDelta30d: d30.value,
      hasMovementData: !(d24.missing && d7.missing && d30.missing),
      starsDelta24hMissing: d24.missing,
      starsDelta7dMissing: d7.missing,
      starsDelta30dMissing: d30.missing,
    });
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
    const aggregate = aggregates.get(r.fullName);
    const catIdx = (perCatCounter.get(r.categoryId) ?? 0) + 1;
    perCatCounter.set(r.categoryId, catIdx);
    sorted[i] = {
      ...r,
      ...(aggregate
        ? {
            stars: aggregate.activityStars,
            forks: aggregate.forks,
            contributors: aggregate.contributors,
            starsDelta24h: aggregate.stars24h,
            starsDelta7d: aggregate.stars7d,
            starsDelta30d: aggregate.stars30d,
          }
        : {}),
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

/** Track count for pagination debug. Equal to `getAllFullNames().length`. */
export function getDerivedRepoCount(): number {
  return getAllFullNames().length;
}

// Test-only cache reset.
export function __resetDerivedReposCache(): void {
  _cache = null;
  _byFullName = null;
  _byId = null;
}
