// TrendingRepo Pipeline — GitHub Repo domain adapter.
//
// Wraps the existing scoreBatch() so the cross-domain assembler can include
// github-repo alongside the new domains without duplicating the legacy
// formula.

import type { Repo } from "../../../types";
import { scoreBatch } from "../engine";
import type { DomainItem, DomainScorer, ScoredItem } from "./types";

export interface GithubRepoItem extends DomainItem {
  domainKey: "github-repo";
  repo: Repo;
}

function computeRaw(items: GithubRepoItem[]): ScoredItem<GithubRepoItem>[] {
  if (items.length === 0) return [];
  const repos = items.map((i) => i.repo);
  const scores = scoreBatch(repos);

  return items.map((item, idx) => {
    const s = scores[idx];
    return {
      item,
      rawComponents: { ...s.components },
      weights: { ...s.weights },
      rawScore: s.overall,
      primaryMetric: {
        name: "stars24h",
        value: item.repo.starsDelta24h ?? 0,
        label: "Stars (24h)",
      },
      explanation: s.explanation,
    };
  });
}

export const githubRepoScorer: DomainScorer<GithubRepoItem> = {
  domainKey: "github-repo",
  // Default weights are category-resolved per repo by scoreBatch; this
  // surfaces the base default for inspection.
  defaultWeights: Object.freeze({
    starVelocity24h: 0.2,
    starVelocity7d: 0.15,
    forkVelocity7d: 0.08,
    contributorGrowth30d: 0.1,
    commitFreshness: 0.12,
    releaseFreshness: 0.08,
    socialBuzz: 0.12,
    issueActivity: 0.05,
    communityHealth: 0.05,
    categoryMomentum: 0.05,
  }),
  computeRaw,
};
