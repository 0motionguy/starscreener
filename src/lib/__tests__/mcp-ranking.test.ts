import assert from "node:assert/strict";
import test from "node:test";

import {
  mcpTrendRank,
  mcpUsageMetric,
  rankMcpItems,
} from "../mcp-ranking";
import type { EcosystemLeaderboardItem } from "../ecosystem-leaderboards";
import type { Repo } from "../types";

function mcp(
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
    topic: "MCP",
    tags: ["mcp"],
    agents: [],
    linkedRepo: null,
    popularity: null,
    popularityLabel: "",
    signalScore: 1,
    postedAt: "2026-05-07T00:00:00.000Z",
    sourceLabel: "MCP registries",
    vendor: null,
    logoUrl: null,
    brandColor: null,
    verified: false,
    crossSourceCount: 1,
    ...overrides,
  };
}

function repo(overrides: Partial<Repo>): Repo {
  return overrides as Repo;
}

test("rankMcpItems uses source velocity before static absolute popularity", () => {
  const moving = mcp("moving", {
    hotness: 5,
    popularity: 271,
    popularityLabel: "Connections",
    mcp: {
      installs24h: 10,
      installs7d: 80,
      installs30d: 200,
    } as EcosystemLeaderboardItem["mcp"],
  });
  const staticPopular = mcp("static-popular", {
    hotness: 90,
    popularity: 200_000,
    popularityLabel: "Stars",
    mcp: {
      installsTotal: 200_000,
    } as EcosystemLeaderboardItem["mcp"],
  });

  const ranked = rankMcpItems([staticPopular, moving], new Map());

  assert.equal(ranked[0]?.item.id, "moving");
  assert.equal(ranked[0]?.trendSource, "registry-velocity");
  assert.ok(
    mcpTrendRank(moving, undefined) >
      mcpTrendRank(staticPopular, undefined),
  );
});

test("rankMcpItems falls back to the existing MCP domain scorer", () => {
  const domainWinner = mcp("domain-winner", {
    rank: 0,
    hotness: 80,
    signalScore: 10,
    mcp: {
      toolCount: 8,
    } as EcosystemLeaderboardItem["mcp"],
  });
  const domainLoser = mcp("domain-loser", {
    rank: 0,
    hotness: 20,
    signalScore: 99,
    mcp: {
      toolCount: 8,
    } as EcosystemLeaderboardItem["mcp"],
  });

  const ranked = rankMcpItems([domainLoser, domainWinner], new Map());

  assert.equal(ranked[0]?.item.id, "domain-winner");
  assert.equal(ranked[0]?.trendSource, "domain-scorer");
});

test("rankMcpItems prefers published source order over the domain scorer when velocity is absent", () => {
  const sourceWinner = mcp("source-winner", {
    rank: 2,
    hotness: 10,
    signalScore: 1,
  });
  const scorerWinner = mcp("scorer-winner", {
    rank: 200,
    hotness: 90,
    signalScore: 90,
  });

  const ranked = rankMcpItems([scorerWinner, sourceWinner], new Map());

  assert.equal(ranked[0]?.item.id, "source-winner");
  assert.equal(ranked[0]?.trendSource, "source-rank");
});

test("rankMcpItems keeps displayable MCP rows above empty presence-only rows", () => {
  const withData = mcp("with-data", {
    popularity: 12,
    popularityLabel: "Connections",
    signalScore: 1,
  });
  const emptyPresence = mcp("empty-presence", {
    popularity: null,
    signalScore: 100,
    crossSourceCount: 4,
  });

  const ranked = rankMcpItems([emptyPresence, withData], new Map());

  assert.equal(ranked[0]?.item.id, "with-data");
  assert.equal(ranked[0]?.hasFillableData, true);
});

test("mcpUsageMetric ignores one-install placeholders", () => {
  const sourceUsage = mcp("source-usage", {
    mcp: {
      installsTotal: 1,
      visitors4w: 44,
    } as EcosystemLeaderboardItem["mcp"],
  });
  const placeholderOnly = mcp("placeholder-only", {
    mcp: {
      installsTotal: 1,
    } as EcosystemLeaderboardItem["mcp"],
  });

  assert.deepEqual(mcpUsageMetric(sourceUsage), {
    value: 44,
    label: "4w visitors",
  });
  assert.equal(mcpUsageMetric(placeholderOnly), null);
});

test("rankMcpItems uses linked repo star deltas only as a real fallback signal", () => {
  const activeLinked = mcp("active-linked", {
    linkedRepo: "owner/active",
    popularity: 50,
    popularityLabel: "Stars",
    hotness: 1,
  });
  const quietLinked = mcp("quiet-linked", {
    linkedRepo: "owner/quiet",
    popularity: 100_000,
    popularityLabel: "Stars",
    hotness: 90,
  });
  const repos = new Map<string, Repo>([
    [
      "owner/active",
      repo({
        fullName: "owner/active",
        stars: 100,
        starsDelta24h: 8,
        starsDelta7d: 30,
        starsDelta30d: 90,
      }),
    ],
    [
      "owner/quiet",
      repo({
        fullName: "owner/quiet",
        stars: 100_000,
        starsDelta24h: 0,
        starsDelta7d: 0,
        starsDelta30d: 0,
      }),
    ],
  ]);

  const ranked = rankMcpItems([quietLinked, activeLinked], repos);

  assert.equal(ranked[0]?.item.id, "active-linked");
  assert.equal(ranked[0]?.trendSource, "linked-repo-velocity");
});
