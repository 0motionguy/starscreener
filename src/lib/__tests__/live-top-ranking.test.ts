import assert from "node:assert/strict";
import test from "node:test";

import { compareLiveTopTrending } from "@/lib/live-top-ranking";
import type { Repo } from "@/lib/types";

function repo(partial: Partial<Repo> & Pick<Repo, "id" | "fullName">): Repo {
  return {
    id: partial.id,
    owner: "acme",
    name: partial.fullName.split("/")[1] ?? "repo",
    fullName: partial.fullName,
    description: "",
    url: `https://github.com/${partial.fullName}`,
    ownerAvatarUrl: "",
    topics: [],
    stars: 10_000,
    forks: 100,
    starsDelta24h: partial.starsDelta24h ?? 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    trendScore24h: partial.trendScore24h ?? 0,
    trendScore7d: 0,
    trendScore30d: 0,
    momentumScore: partial.momentumScore ?? 0,
    rank: 0,
    categoryRank: 0,
    language: "TypeScript",
    categoryId: "devtools",
    contributors: 1,
    contributorsDelta30d: 0,
    forksDelta7d: 0,
    openIssues: 0,
    socialBuzzScore: 0,
    mentionCount24h: partial.mentionCount24h ?? 0,
    movementStatus: "stable",
    sparklineData: [],
    createdAt: new Date().toISOString(),
    // Repo declares these as string; null is valid in fixtures (cast).
    lastCommitAt: null as unknown as string,
    lastReleaseAt: null as unknown as string,
    lastReleaseTag: null as unknown as string,
  } as Repo;
}

test("compareLiveTopTrending ranks by TRENDING (24h trend score) before momentum", () => {
  const highMomentumLowTrend = repo({
    id: "1",
    fullName: "acme/high-momentum-low-trend",
    trendScore24h: 10,
    starsDelta24h: 500,
    mentionCount24h: 100,
    momentumScore: 99,
  });
  const lowMomentumHighTrend = repo({
    id: "2",
    fullName: "acme/low-momentum-high-trend",
    trendScore24h: 200,
    starsDelta24h: 20,
    mentionCount24h: 2,
    momentumScore: 1,
  });

  const sorted = [highMomentumLowTrend, lowMomentumHighTrend].sort(compareLiveTopTrending);
  assert.equal(sorted[0].id, "2");
});

test("compareLiveTopTrending ties break on absolute 24h delta, then mentions", () => {
  const a = repo({
    id: "a",
    fullName: "acme/a",
    trendScore24h: 100,
    starsDelta24h: 30,
    mentionCount24h: 5,
    momentumScore: 10,
  });
  const b = repo({
    id: "b",
    fullName: "acme/b",
    trendScore24h: 100,
    starsDelta24h: 40,
    mentionCount24h: 1,
    momentumScore: 99,
  });
  const c = repo({
    id: "c",
    fullName: "acme/c",
    trendScore24h: 100,
    starsDelta24h: 40,
    mentionCount24h: 8,
    momentumScore: 0,
  });

  const sorted = [a, b, c].sort(compareLiveTopTrending);
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["c", "b", "a"],
  );
});

