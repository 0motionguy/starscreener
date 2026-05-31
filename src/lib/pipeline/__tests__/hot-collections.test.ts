import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  groupHotCollectionRows,
  isUsableHotCollectionsPayload,
} from "../../hot-collections";

test("groupHotCollectionRows groups rows into ordered collections and maps slugs", () => {
  const groups = groupHotCollectionRows(
    [
      {
        id: 10098,
        name: "AI Agent Frameworks",
        repos: 17,
        repoId: 1,
        repoName: "openai/openai-agents-python",
        repoCurrentPeriodRank: 1,
        repoPastPeriodRank: 2,
        repoRankChanges: 1,
      },
      {
        id: 10098,
        name: "AI Agent Frameworks",
        repos: 17,
        repoId: 2,
        repoName: "VoltAgent/voltagent",
        repoCurrentPeriodRank: 2,
        repoPastPeriodRank: 3,
        repoRankChanges: 1,
      },
      {
        id: 10106,
        name: "Coding Agents",
        repos: 20,
        repoId: 3,
        repoName: "anthropics/claude-code",
        repoCurrentPeriodRank: 1,
        repoPastPeriodRank: 1,
        repoRankChanges: 0,
      },
    ],
    [
      {
        slug: "ai-agent-frameworks",
        id: 10098,
        name: "AI Agent Frameworks",
        items: [],
      },
      {
        slug: "coding-agents",
        id: 10106,
        name: "Coding Agents",
        items: [],
      },
    ],
  );

  assert.equal(groups.length, 2);
  assert.equal(groups[0].slug, "ai-agent-frameworks");
  assert.equal(groups[0].topRepos.length, 2);
  assert.equal(groups[0].topRepos[0].repoName, "openai/openai-agents-python");
  assert.equal(groups[1].slug, "coding-agents");
});

test("hot collections payload quality rejects fresh empty rows", () => {
  assert.equal(
    isUsableHotCollectionsPayload({
      fetchedAt: "2026-06-01T00:00:00.000Z",
      rows: [],
    }),
    false,
  );
  assert.equal(
    isUsableHotCollectionsPayload({
      fetchedAt: "2026-06-01T00:00:00.000Z",
      rows: [
        {
          id: 10098,
          name: "AI Agent Frameworks",
          repos: 17,
          repoId: 1,
          repoName: "cached/project",
          repoCurrentPeriodRank: 1,
          repoPastPeriodRank: 2,
          repoRankChanges: 1,
        },
      ],
    }),
    true,
  );
});
