import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  buildCollectionRankingEntries,
  getCollectionRankingsCoverage,
} from "../../collection-rankings";

test("buildCollectionRankingEntries maps slugs and sorts ranking rows by current rank", () => {
  const entries = buildCollectionRankingEntries(
    {
      fetchedAt: "2026-04-20T07:12:56.475Z",
      period: "past_28_days",
      collections: {
        "10098": {
          stars: [
            {
              repoId: 2,
              repoName: "langchain-ai/langchain",
              currentPeriodGrowth: 609,
              pastPeriodGrowth: 839,
              growthPop: -27.41,
              rankPop: 1,
              total: 116247,
              currentPeriodRank: 2,
              pastPeriodRank: 1,
            },
            {
              repoId: 1,
              repoName: "openai/openai-agents-python",
              currentPeriodGrowth: 645,
              pastPeriodGrowth: 245,
              growthPop: 163.27,
              rankPop: -5,
              total: 14449,
              currentPeriodRank: 1,
              pastPeriodRank: 6,
            },
          ],
          issues: [
            {
              repoId: 3,
              repoName: "microsoft/JARVIS",
              currentPeriodGrowth: 91,
              pastPeriodGrowth: 79,
              growthPop: 15.19,
              rankPop: 0,
              total: 778,
              currentPeriodRank: 1,
              pastPeriodRank: 1,
            },
          ],
        },
      },
    },
    [
      {
        slug: "ai-agent-frameworks",
        id: 10098,
        name: "AI Agent Frameworks",
        items: [],
      },
    ],
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0].slug, "ai-agent-frameworks");
  assert.equal(entries[0].name, "AI Agent Frameworks");
  assert.equal(entries[0].period, "past_28_days");
  assert.equal(entries[0].stars.rows[0].repoName, "openai/openai-agents-python");
  assert.equal(entries[0].stars.rows[1].repoName, "langchain-ai/langchain");
  assert.equal(entries[0].issues.rows[0].repoName, "microsoft/JARVIS");
});

test("getCollectionRankingsCoverage counts collections with star and issue rankings", () => {
  const coverage = getCollectionRankingsCoverage([
    {
      id: 10098,
      slug: "ai-agent-frameworks",
      name: "AI Agent Frameworks",
      period: "past_28_days",
      stars: { rows: [{ repoId: 1, repoName: "a/b", currentPeriodGrowth: 10, pastPeriodGrowth: 5, growthPop: 100, rankPop: 0, total: 50, currentPeriodRank: 1, pastPeriodRank: 1 }] },
      issues: { rows: [] },
    },
    {
      id: 10106,
      slug: "coding-agents",
      name: "Coding Agents",
      period: "past_28_days",
      stars: { rows: [] },
      issues: { rows: [{ repoId: 2, repoName: "c/d", currentPeriodGrowth: 4, pastPeriodGrowth: 2, growthPop: 100, rankPop: 1, total: 20, currentPeriodRank: 1, pastPeriodRank: 2 }] },
    },
  ]);

  assert.deepEqual(coverage, {
    totalCollections: 2,
    withStars: 1,
    withIssues: 1,
    withAnyRanking: 2,
  });
});
