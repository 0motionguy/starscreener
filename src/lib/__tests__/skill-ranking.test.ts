import assert from "node:assert/strict";
import test from "node:test";

import { rankSkillItems, skillTrendRank } from "../skill-ranking";
import type { EcosystemLeaderboardItem } from "../ecosystem-leaderboards";

function skill(
  id: string,
  overrides: Partial<EcosystemLeaderboardItem> = {},
): EcosystemLeaderboardItem {
  return {
    id,
    title: id,
    url: `https://example.com/${id}`,
    author: null,
    rank: 1,
    description: null,
    topic: "skills",
    tags: [],
    agents: [],
    linkedRepo: null,
    popularity: null,
    popularityLabel: "",
    signalScore: 1,
    postedAt: null,
    sourceLabel: "skills.sh",
    vendor: null,
    logoUrl: null,
    brandColor: null,
    verified: false,
    crossSourceCount: 1,
    ...overrides,
  };
}

test("skillTrendRank prefers source-published trend score over internal signal score", () => {
  const sourceWinner = skill("source-winner", {
    sourceTrendScore: 12,
    signalScore: 1,
  });
  const internalWinner = skill("internal-winner", {
    sourceTrendScore: null,
    signalScore: 100,
  });

  assert.ok(skillTrendRank(sourceWinner) > skillTrendRank(internalWinner));
  assert.equal(rankSkillItems([internalWinner, sourceWinner])[0]?.id, "source-winner");
});

test("skillTrendRank uses source rank when source score is unavailable", () => {
  const rankedFirst = skill("ranked-first", {
    sourceTrendRank: 3,
    signalScore: 1,
  });
  const scorerFirst = skill("scorer-first", {
    sourceTrendRank: null,
    signalScore: 100,
  });

  assert.equal(rankSkillItems([scorerFirst, rankedFirst])[0]?.id, "ranked-first");
});
