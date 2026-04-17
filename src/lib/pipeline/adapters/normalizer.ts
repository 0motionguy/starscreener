// StarScreener — GitHub raw → Repo normalization.
//
// Pure, synchronous transform from the upstream adapter shapes into the public
// Repo type. Does not compute deltas, momentum, category, or social signals —
// those fields are populated by later pipeline stages (delta engine, scorer,
// classifier, social aggregator) and are initialized to safe zero/placeholder
// values here.

import { slugToId } from "@/lib/utils";
import type { Repo } from "@/lib/types";
import type { GitHubRepoRaw, GitHubReleaseRaw } from "../types";

/**
 * Normalize a GitHub REST API repo payload (plus optional latest release and
 * contributor count) into a Repo record ready for persistence.
 *
 * Downstream pipeline stages own:
 *   - categoryId           → classifier
 *   - *Delta* fields       → delta engine
 *   - momentumScore        → scorer
 *   - movementStatus       → scorer
 *   - rank / categoryRank  → rank engine
 *   - sparklineData        → snapshot rollup
 *   - socialBuzzScore, mentionCount24h → social aggregator
 */
export function normalizeGitHubRepo(
  raw: GitHubRepoRaw,
  release: GitHubReleaseRaw | null,
  contributorCount: number,
): Repo {
  return {
    id: slugToId(raw.full_name),
    fullName: raw.full_name,
    name: raw.name,
    owner: raw.owner.login,
    ownerAvatarUrl: raw.owner.avatar_url,
    description: raw.description ?? "",
    url: raw.html_url,
    language: raw.language,
    topics: raw.topics ?? [],
    categoryId: "other",

    stars: raw.stargazers_count,
    forks: raw.forks_count,
    contributors: contributorCount,
    openIssues: raw.open_issues_count,

    // GitHub's best public proxy for "last commit" on the default branch.
    lastCommitAt: raw.pushed_at,
    lastReleaseAt: release?.published_at ?? null,
    lastReleaseTag: release?.tag_name ?? null,
    createdAt: raw.created_at,

    // Deltas — filled by the delta engine once we have history.
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,

    // Scoring — filled by the scorer.
    momentumScore: 0,
    movementStatus: "stable",
    rank: 0,
    categoryRank: 0,

    // Rolled up from snapshots later.
    sparklineData: [],

    // Filled by social aggregator.
    socialBuzzScore: 0,
    mentionCount24h: 0,
  };
}
