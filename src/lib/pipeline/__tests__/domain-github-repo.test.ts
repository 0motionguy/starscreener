// TrendingRepo Pipeline — github-repo domain adapter tests.
//
// The adapter wraps the existing scoreBatch(); these tests just verify the
// shape conversion and that we can rank a small batch sensibly.

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Repo } from "../../types";
import {
  githubRepoScorer,
  type GithubRepoItem,
} from "../scoring/domain/github-repo";

function makeRepo(partial: Partial<Repo> & { fullName: string }): Repo {
  const [owner, name] = partial.fullName.split("/");
  return {
    id: partial.id ?? `${owner}--${name}`,
    fullName: partial.fullName,
    name: partial.name ?? name ?? "",
    owner: partial.owner ?? owner ?? "",
    ownerAvatarUrl: partial.ownerAvatarUrl ?? "",
    description: partial.description ?? "",
    url: partial.url ?? `https://github.com/${partial.fullName}`,
    language: partial.language ?? null,
    topics: partial.topics ?? [],
    categoryId: partial.categoryId ?? "devtools",
    stars: partial.stars ?? 100,
    forks: partial.forks ?? 10,
    contributors: partial.contributors ?? 3,
    openIssues: partial.openIssues ?? 5,
    lastCommitAt:
      partial.lastCommitAt ??
      new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    lastReleaseAt: partial.lastReleaseAt ?? null,
    lastReleaseTag: partial.lastReleaseTag ?? null,
    createdAt: partial.createdAt ?? new Date().toISOString(),
    starsDelta24h: partial.starsDelta24h ?? 0,
    starsDelta7d: partial.starsDelta7d ?? 0,
    starsDelta30d: partial.starsDelta30d ?? 0,
    forksDelta7d: partial.forksDelta7d ?? 0,
    contributorsDelta30d: partial.contributorsDelta30d ?? 0,
    momentumScore: partial.momentumScore ?? 0,
    movementStatus: partial.movementStatus ?? "stable",
    rank: partial.rank ?? 0,
    categoryRank: partial.categoryRank ?? 0,
    sparklineData: partial.sparklineData ?? [],
    socialBuzzScore: partial.socialBuzzScore ?? 0,
    mentionCount24h: partial.mentionCount24h ?? 0,
  };
}

function mk(repo: Repo): GithubRepoItem {
  return {
    domainKey: "github-repo",
    id: repo.id,
    joinKeys: { repoFullName: repo.fullName },
    repo,
  };
}

test("github-repo computeRaw on empty array returns empty", () => {
  assert.deepEqual(githubRepoScorer.computeRaw([]), []);
});

test("github-repo adapter: rawScore in [0,100] and primary metric set", () => {
  const repo = makeRepo({
    fullName: "vercel/next.js",
    stars: 100000,
    forks: 20000,
    starsDelta24h: 500,
    starsDelta7d: 2500,
    forksDelta7d: 80,
    contributorsDelta30d: 20,
    contributors: 1000,
    socialBuzzScore: 70,
  });
  const [s] = githubRepoScorer.computeRaw([mk(repo)]);
  assert.ok(s.rawScore >= 0 && s.rawScore <= 100);
  assert.equal(s.primaryMetric.name, "stars24h");
  assert.equal(s.primaryMetric.value, 500);
  assert.ok(typeof s.explanation === "string" && s.explanation.length > 0);
  assert.ok(s.weights.starVelocity24h !== undefined);
});

test("github-repo ranking: hot repo beats stale repo", () => {
  const hot = makeRepo({
    fullName: "hot/repo",
    stars: 5000,
    forks: 800,
    contributors: 50,
    starsDelta24h: 200,
    starsDelta7d: 800,
    forksDelta7d: 30,
    contributorsDelta30d: 8,
    socialBuzzScore: 80,
  });
  const stale = makeRepo({
    fullName: "stale/repo",
    stars: 200,
    forks: 5,
    contributors: 1,
    starsDelta24h: 0,
    starsDelta7d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    socialBuzzScore: 0,
    lastCommitAt: new Date(Date.now() - 200 * 24 * 3600 * 1000).toISOString(),
  });
  const [hs, ss] = githubRepoScorer.computeRaw([mk(hot), mk(stale)]);
  assert.ok(
    hs.rawScore > ss.rawScore,
    `hot ${hs.rawScore} > stale ${ss.rawScore}`,
  );
});
