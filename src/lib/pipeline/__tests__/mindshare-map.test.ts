import { test } from "node:test";
import { strict as assert } from "node:assert";

import type { Repo } from "../../types";
import { buildMindshareGroups } from "../../mindshare-map";

function repo(overrides: Partial<Repo> & Pick<Repo, "fullName">): Repo {
  const { fullName, ...rest } = overrides;
  const [owner, name] = fullName.split("/");
  return {
    id: fullName.toLowerCase().replace("/", "--"),
    fullName,
    name: name ?? fullName,
    owner: owner ?? "owner",
    ownerAvatarUrl: "",
    description: "",
    url: `https://github.com/${fullName}`,
    language: null,
    topics: [],
    categoryId: "devtools",
    stars: 0,
    forks: 0,
    contributors: 0,
    openIssues: 0,
    lastCommitAt: "",
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "",
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore: 0,
    movementStatus: "stable",
    rank: 0,
    categoryRank: 0,
    sparklineData: [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
    ...rest,
  };
}

test("mindshare groups prefer curated OSS Insight collections", () => {
  const groups = buildMindshareGroups(
    [
      repo({
        fullName: "modelcontextprotocol/servers",
        tags: ["mcp"],
        starsDelta24h: 20,
      }),
      repo({
        fullName: "anthropics/claude-code",
        tags: ["mcp", "claude-code"],
        starsDelta24h: 5,
      }),
      repo({
        fullName: "astral-sh/ruff",
        categoryId: "devtools",
        starsDelta24h: 10,
      }),
      repo({
        fullName: "ignored/flat",
        tags: ["ai-agents"],
        starsDelta24h: 0,
      }),
    ],
    {
      collections: [
        {
          slug: "mcp-servers",
          id: 10105,
          name: "MCP Servers",
          items: ["modelcontextprotocol/servers", "anthropics/claude-code"],
        },
      ],
      maxGroups: 8,
      reposPerGroup: 4,
    },
  );

  assert.equal(groups.length, 2);
  assert.equal(groups[0].id, "mcp-servers");
  assert.equal(groups[0].label, "MCP Servers");
  assert.equal(groups[0].total24h, 25);
  assert.equal(groups[0].repos[0].fullName, "modelcontextprotocol/servers");
  assert.equal(groups[1].id, "devtools");
  assert.equal(groups[1].total24h, 10);
  assert.equal(groups[0].sharePct, 71.4);
});

test("mindshare groups use OSS Insight collection names and AI keyword fallback", () => {
  const repos = [
    repo({
      fullName: "forrestchang/andrej-karpathy-skills",
      description: "Installable GitHub library of agentic skills for Claude Code and Codex CLI.",
      starsDelta24h: 30,
    }),
    repo({
      fullName: "openai/openai-agents-python",
      collectionNames: ["AI Agent Frameworks"],
      starsDelta24h: 20,
    }),
    repo({
      fullName: "acme/plain-devtool",
      categoryId: "devtools",
      starsDelta24h: 10,
    }),
  ];
  const groups = buildMindshareGroups(
    repos,
    {
      collections: [],
      maxGroups: 8,
      reposPerGroup: 4,
    },
  );

  assert.equal(groups.length, 3);
  assert.equal(groups[0].id, "agent-skills");
  assert.equal(groups[0].label, "Skills");
  assert.equal(groups[0].total24h, 30);
  assert.equal(groups[1].id, "ai-agent-frameworks");
  assert.equal(groups[1].label, "AI Agent Frameworks");
  assert.equal(groups[2].id, "devtools");

  const focused = buildMindshareGroups(repos, {
    collections: [],
    includeCategoryFallback: false,
    maxGroups: 8,
    reposPerGroup: 4,
  });
  assert.equal(focused.length, 2);
  assert.equal(focused[0].id, "agent-skills");
  assert.equal(focused[1].id, "ai-agent-frameworks");
});
