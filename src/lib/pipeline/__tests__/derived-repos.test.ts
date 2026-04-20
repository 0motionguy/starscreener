import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  __resetDerivedReposCache,
  getDerivedRepoByFullName,
  getDerivedRepos,
} from "../../derived-repos";
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
  assert.equal(repo.stars, repoDelta.stars_now);
});

test("derived repos expose a 30-point sparkline ending at current stars", () => {
  __resetDerivedReposCache();

  const sourceRow = getTrending("past_24_hours", "All")[0];
  assert.ok(sourceRow, "expected committed OSS Insight 24h data");

  const repo = getDerivedRepoByFullName(sourceRow.repo_name);
  assert.ok(repo, `expected derived repo for ${sourceRow.repo_name}`);
  assert.equal(repo.sparklineData.length, 30);
  assert.equal(repo.sparklineData[repo.sparklineData.length - 1], repo.stars);
  assert.ok(
    repo.sparklineData.some((value) => value > 0),
    "expected sparkline data to include non-zero values",
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
