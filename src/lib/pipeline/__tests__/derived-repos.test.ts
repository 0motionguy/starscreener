import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  __applyDiversityRerankForTests,
  __resetDerivedReposCache,
  getDerivedRepoByFullName,
  getDerivedRepos,
} from "../../derived-repos";
import type { Repo } from "../../types";
import {
  getDeltas,
  getTopMoversByDelta24h,
  getTrending,
  type TrendingLanguage,
} from "../../trending";

const LANGS: TrendingLanguage[] = ["All", "Python", "TypeScript", "Rust", "Go"];

function maxPast24hStars(fullName: string): number {
  let max = 0;
  for (const lang of LANGS) {
    for (const row of getTrending("past_24_hours", lang)) {
      if (row.repo_name !== fullName) continue;
      const stars = Number.parseInt(row.stars ?? "0", 10);
      if (Number.isFinite(stars)) max = Math.max(max, stars);
    }
  }
  return max;
}

function maxPast24hScore(fullName: string): number {
  let max = 0;
  for (const lang of LANGS) {
    for (const row of getTrending("past_24_hours", lang)) {
      if (row.repo_name !== fullName) continue;
      const score = Number.parseFloat(row.total_score ?? "0");
      if (Number.isFinite(score)) max = Math.max(max, score);
    }
  }
  return max;
}

test("derived repos project OSS Insight 24h stars into starsDelta24h", () => {
  __resetDerivedReposCache();

  const sourceRow = getTrending("past_24_hours", "All")[0];
  assert.ok(sourceRow, "expected committed OSS Insight 24h data");

  const repo = getDerivedRepoByFullName(sourceRow.repo_name);
  assert.ok(repo, `expected derived repo for ${sourceRow.repo_name}`);

  const expected24h = maxPast24hStars(sourceRow.repo_name);
  assert.ok(expected24h > 0, "fixture should include positive 24h stars");
  assert.equal(repo.starsDelta24h, expected24h);
  assert.equal(repo.starsDelta24hMissing, false);

  const deltas = getDeltas();
  const repoDelta = deltas.repos[sourceRow.repo_id];
  assert.ok(repoDelta, "expected repo in deltas.json");
  assert.ok(
    repo.stars >= repoDelta.stars_now,
    "lifetime stars should not be below OSS period-star fallback",
  );
  assert.equal(repo.trendScore24h, maxPast24hScore(sourceRow.repo_name));
});

test("derived repos keep lifetime stars separate from OSS Insight period gains", () => {
  __resetDerivedReposCache();

  const repo = getDerivedRepoByFullName("forrestchang/andrej-karpathy-skills");
  assert.ok(repo, "expected known trending fixture repo");

  assert.ok(
    repo.stars > 50_000,
    `expected GitHub lifetime stars, got ${repo.stars}`,
  );
  assert.ok(
    repo.stars > repo.starsDelta30d,
    `lifetime stars (${repo.stars}) must exceed 30d gain (${repo.starsDelta30d})`,
  );
});

test("top movers use OSS Insight 24h activity instead of cold-start deltas", () => {
  __resetDerivedReposCache();

  const repos = getDerivedRepos();
  assert.ok(repos.length > 0, "expected derived repos");
  assert.ok(
    repos.some((repo) => repo.starsDelta24h > 0),
    "expected nonzero 24h trend data",
  );

  const top = getTopMoversByDelta24h(1)[0];
  assert.ok(top, "expected top mover");
  assert.ok(top.starsDelta24h > 0, "expected positive top mover value");
});

function makeRankRow(index: number, stars: number, momentumScore: number): Repo {
  return {
    id: `owner--repo-${index}`,
    fullName: `owner/repo-${index}`,
    name: `repo-${index}`,
    owner: "owner",
    ownerAvatarUrl: "",
    description: "",
    url: `https://github.com/owner/repo-${index}`,
    language: "TypeScript",
    topics: [],
    categoryId: "ai",
    stars,
    forks: 0,
    contributors: 0,
    openIssues: 0,
    lastCommitAt: "2026-05-05T00:00:00.000Z",
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "2026-05-05T00:00:00.000Z",
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore,
    movementStatus: "stable",
    rank: index + 1,
    categoryRank: index + 1,
    sparklineData: [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
  };
}

test("diversity rerank caps mega-repos to 50% of top 20", () => {
  const rows: Repo[] = [];
  for (let i = 0; i < 14; i++) rows.push(makeRankRow(i, 90_000, 200 - i));
  for (let i = 14; i < 30; i++) rows.push(makeRankRow(i, 20_000, 200 - i));

  const reranked = __applyDiversityRerankForTests(rows);
  const megaInTop20 = reranked
    .slice(0, 20)
    .filter((repo) => repo.stars >= 50_000).length;

  assert.equal(megaInTop20, 10);
});

test("diversity rerank demotes long-staying repos inside the top window", () => {
  const rows: Repo[] = [];
  for (let i = 0; i < 25; i++) rows.push(makeRankRow(i, 30_000, 200 - i));

  const longStayIds = rows.slice(0, 8).map((repo) => repo.id);
  const reranked = __applyDiversityRerankForTests(rows, longStayIds);
  const rerankedTop8 = reranked.slice(0, 8).map((repo) => repo.id);
  const overlap = rerankedTop8.filter((id) => longStayIds.includes(id)).length;

  assert.ok(
    overlap < 8,
    "expected at least one long-staying repo to be pushed out of the top 8",
  );
});
