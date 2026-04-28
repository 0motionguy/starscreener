// OSSInsights trending-feed aggregation.
//
// The trending feed is keyed by (period, language) so the same repo can
// appear up to PERIODS.length × LANGS.length times. We collapse those into
// one TrendingRepoAggregate per repo, taking the max stars/score per
// period and union-ing collection names. The orchestrator then drives
// classification + scoring + cross-signal off the aggregated view.
//
// Also exports `baseRepoFromTrending` — turns an aggregate + GitHub
// metadata into a starting Repo skeleton that the orchestrator further
// enriches with deltas, sparkline, and history.
//
// Extracted from derived-repos.ts as Sprint 4 step 3 of LIB-01.

import type { RepoMetadata } from "../../repo-metadata";
import {
  getTrending,
  type TrendingLanguage,
  type TrendingPeriod,
  type TrendingRow,
} from "../../trending";
import type { Repo } from "../../types";
import { slugToId } from "../../utils";

const PERIODS: TrendingPeriod[] = [
  "past_24_hours",
  "past_week",
  "past_month",
];
const LANGS: TrendingLanguage[] = ["All", "Python", "TypeScript", "Rust", "Go"];

export interface TrendingRepoAggregate {
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

/**
 * Walk every (period, language) bucket of the trending feed and collapse
 * into a per-repo aggregate. Keys by row.repo_name (`owner/name`). Skips
 * malformed rows that don't carry a slash-delimited repo name.
 */
export function buildTrendingAggregates(): Map<string, TrendingRepoAggregate> {
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
export function baseRepoFromTrending(
  aggregate: TrendingRepoAggregate,
  fetchedAt: string,
  metadata: RepoMetadata | null,
): Repo {
  const row = aggregate.row;
  const parts = row.repo_name.split("/");
  const owner = parts[0] ?? "";
  const name = parts[1] ?? row.repo_name;
  const lastCommitAt =
    metadata?.pushedAt || metadata?.updatedAt || metadata?.createdAt || fetchedAt;
  return {
    id: slugToId(row.repo_name),
    fullName: metadata?.fullName ?? row.repo_name,
    name: metadata?.name ?? name,
    owner: metadata?.owner ?? owner,
    ownerAvatarUrl:
      metadata?.ownerAvatarUrl || (owner ? `https://github.com/${owner}.png` : ""),
    description: metadata?.description || row.description || "",
    url: metadata?.url ?? `https://github.com/${row.repo_name}`,
    language: row.primary_language || metadata?.language || null,
    topics: metadata?.topics ?? [],
    categoryId: "other",
    stars: metadata?.stars ?? aggregate.activityStars,
    forks: metadata?.forks ?? aggregate.forks,
    contributors: aggregate.contributors,
    openIssues: metadata?.openIssues ?? 0,
    lastCommitAt,
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: metadata?.createdAt ?? "",
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
    archived: metadata?.archived,
  };
}
