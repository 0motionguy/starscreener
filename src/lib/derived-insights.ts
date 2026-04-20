import { CATEGORIES } from "./constants";
import { applyMetaFilter, extractLanguages } from "./filters";
import { getDerivedRepos } from "./derived-repos";
import type { MetaCounts, Repo, WhyMoving } from "./types";
import type { CategoryStats } from "./pipeline/queries/aggregate";

const DAY_MS = 86_400_000;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return null;
  return (Date.now() - timestamp) / DAY_MS;
}

function categoryOrder(categoryId: string): number {
  const index = CATEGORIES.findIndex((category) => category.id === categoryId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function getDerivedMetaCounts(repos: Repo[] = getDerivedRepos()): MetaCounts {
  return {
    hot: applyMetaFilter(repos, "hot").length,
    breakouts: applyMetaFilter(repos, "breakouts").length,
    quietKillers: applyMetaFilter(repos, "quiet-killers").length,
    new: applyMetaFilter(repos, "new").length,
    discussed: applyMetaFilter(repos, "discussed").length,
    rankClimbers: applyMetaFilter(repos, "rank-climbers").length,
    freshReleases: applyMetaFilter(repos, "fresh-releases").length,
  };
}

export function getDerivedCategoryStats(
  repos: Repo[] = getDerivedRepos(),
): CategoryStats[] {
  const grouped = new Map<string, Repo[]>();

  for (const repo of repos) {
    const current = grouped.get(repo.categoryId) ?? [];
    current.push(repo);
    grouped.set(repo.categoryId, current);
  }

  const stats: CategoryStats[] = [];
  for (const [categoryId, categoryRepos] of grouped.entries()) {
    const repoCount = categoryRepos.length;
    const totalStars = categoryRepos.reduce((sum, repo) => sum + repo.stars, 0);
    const avgMomentum =
      repoCount > 0
        ? Number(
            (
              categoryRepos.reduce((sum, repo) => sum + repo.momentumScore, 0) /
              repoCount
            ).toFixed(2),
          )
        : 0;

    const topMover = [...categoryRepos].sort((a, b) => {
      if (b.momentumScore !== a.momentumScore) {
        return b.momentumScore - a.momentumScore;
      }
      return b.starsDelta24h - a.starsDelta24h;
    })[0];

    stats.push({
      categoryId,
      repoCount,
      avgMomentum,
      topMoverId: topMover?.id ?? null,
      totalStars,
    });
  }

  stats.sort((a, b) => {
    const orderDiff = categoryOrder(a.categoryId) - categoryOrder(b.categoryId);
    if (orderDiff !== 0) return orderDiff;
    if (b.repoCount !== a.repoCount) return b.repoCount - a.repoCount;
    return b.avgMomentum - a.avgMomentum;
  });

  return stats;
}

export function getDerivedAvailableLanguages(
  repos: Repo[] = getDerivedRepos(),
): string[] {
  return extractLanguages(repos);
}

function sharedCount(left: string[] | undefined, right: string[] | undefined): number {
  if (!left?.length || !right?.length) return 0;
  const rightSet = new Set(right.map((item) => item.toLowerCase()));
  return left.reduce((count, item) => {
    return count + (rightSet.has(item.toLowerCase()) ? 1 : 0);
  }, 0);
}

export function getDerivedRelatedRepos(
  source: Repo,
  limit: number = 6,
  repos: Repo[] = getDerivedRepos(),
): Repo[] {
  return repos
    .filter((repo) => repo.id !== source.id)
    .map((repo) => {
      let score = 0;
      if (repo.categoryId === source.categoryId) score += 5;
      if (repo.language && repo.language === source.language) score += 2;
      score += sharedCount(repo.tags, source.tags) * 2;
      score += sharedCount(repo.collectionNames, source.collectionNames) * 3;
      return { repo, score };
    })
    .filter((item) => item.score > 0 || item.repo.categoryId === source.categoryId)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.repo.momentumScore !== a.repo.momentumScore) {
        return b.repo.momentumScore - a.repo.momentumScore;
      }
      return b.repo.starsDelta24h - a.repo.starsDelta24h;
    })
    .slice(0, limit)
    .map((item) => item.repo);
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function buildDerivedWhyMoving(repo: Repo): WhyMoving | null {
  const factors: WhyMoving["factors"] = [];

  if (repo.starsDelta24h > 0) {
    factors.push({
      factor: "stars_24h",
      headline: `+${formatCount(repo.starsDelta24h)} stars in 24h`,
      detail: `${repo.fullName} added ${formatCount(repo.starsDelta24h)} stars over the last 24 hours.`,
      confidence: repo.starsDelta24h >= 100 ? "high" : "medium",
      timeframe: "24h",
    });
  }

  if (repo.starsDelta7d > repo.starsDelta24h && repo.starsDelta7d > 0) {
    factors.push({
      factor: "stars_7d",
      headline: `+${formatCount(repo.starsDelta7d)} stars in 7d`,
      detail: `The weekly trend is still rising, with ${formatCount(repo.starsDelta7d)} stars added over the last 7 days.`,
      confidence: repo.starsDelta7d >= 250 ? "high" : "medium",
      timeframe: "7d",
    });
  }

  const releaseAgeDays = daysSince(repo.lastReleaseAt);
  if (releaseAgeDays !== null && releaseAgeDays <= 14) {
    factors.push({
      factor: "release_recent",
      headline: repo.lastReleaseTag
        ? `Fresh release: ${repo.lastReleaseTag}`
        : "Fresh release activity",
      detail: `${repo.fullName} shipped a release within the last ${Math.max(
        1,
        Math.round(releaseAgeDays),
      )} days.`,
      confidence: releaseAgeDays <= 3 ? "high" : "medium",
      timeframe: "14d",
    });
  }

  const commitAgeDays = daysSince(repo.lastCommitAt);
  if (commitAgeDays !== null && commitAgeDays <= 7) {
    factors.push({
      factor: "commit_recent",
      headline: "Recent maintainer activity",
      detail: `The default branch saw activity within the last ${Math.max(
        1,
        Math.round(commitAgeDays),
      )} days.`,
      confidence: commitAgeDays <= 2 ? "high" : "medium",
      timeframe: "7d",
    });
  }

  if (repo.collectionNames && repo.collectionNames.length > 0) {
    factors.push({
      factor: "collection_upstream",
      headline: `Tracked in ${repo.collectionNames[0]}`,
      detail: `${repo.fullName} is present in the OSSInsights collection feed, which reinforces the upstream discovery signal.`,
      confidence: "medium",
      timeframe: "now",
    });
  }

  if (factors.length === 0) return null;

  return {
    repoId: repo.id,
    headline: `${repo.fullName} is moving on upstream OSSInsights trend data.`,
    factors: factors.slice(0, 4),
  };
}
