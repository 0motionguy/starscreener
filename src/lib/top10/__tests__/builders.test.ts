// Top10 builders — pure-transform tests.
//
// Fixture-driven; no I/O. Locks in the contract that callers depend on:
// 1. Cap at 10 items.
// 2. Badge logic from cross-signal channels (5/4/3 firing) + breakout HOT.
// 3. Score normalisation to 0–5.
// 4. NEWS fusion deduplicates by canonical URL and ranks by per-source norm.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Repo } from "../../types";
import type { HfModelTrending } from "../../huggingface";
import type {
  EcosystemBoard,
  EcosystemLeaderboardItem,
} from "../../ecosystem-leaderboards";
import type { FundingSignal } from "../../funding/types";
import type { HnStory } from "../../hackernews";
import type { BskyPost } from "../../bluesky";
import type { DevtoArticle } from "../../devto";
import type { LobstersStory } from "../../lobsters";
import type { Launch } from "../../producthunt";

import {
  buildFundingTop10,
  buildLlmTop10,
  buildMcpTop10,
  buildMoversTop10,
  buildNewsTop10,
  buildRepoTop10,
  buildSkillsTop10,
  emptyBundle,
} from "../builders";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRepo(p: Partial<Repo> & Pick<Repo, "fullName" | "name" | "owner">): Repo {
  return {
    id: p.fullName.toLowerCase().replace("/", "--"),
    ownerAvatarUrl: "",
    description: p.description ?? "Test repo",
    url: `https://github.com/${p.fullName}`,
    language: null,
    topics: [],
    categoryId: "other",
    stars: p.stars ?? 1000,
    forks: 0,
    contributors: 0,
    openIssues: 0,
    lastCommitAt: "2026-04-29T00:00:00Z",
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "2024-01-01T00:00:00Z",
    starsDelta24h: p.starsDelta24h ?? 0,
    starsDelta7d: p.starsDelta7d ?? 0,
    starsDelta30d: p.starsDelta30d ?? 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore: p.momentumScore ?? 50,
    movementStatus: p.movementStatus ?? "stable",
    rank: 0,
    categoryRank: 0,
    sparklineData: p.sparklineData ?? [10, 11, 12, 13, 14, 15, 16, 17],
    socialBuzzScore: 0,
    mentionCount24h: 0,
    crossSignalScore: p.crossSignalScore ?? 0,
    channelsFiring: p.channelsFiring ?? 0,
    archived: false,
    deleted: false,
    ...p,
  };
}

// ---------------------------------------------------------------------------
// REPOS
// ---------------------------------------------------------------------------

test("buildRepoTop10: caps at 10 and sorts by crossSignalScore desc", () => {
  const repos: Repo[] = [];
  for (let i = 0; i < 25; i++) {
    repos.push(
      makeRepo({
        fullName: `org${i}/repo${i}`,
        name: `repo${i}`,
        owner: `org${i}`,
        crossSignalScore: i * 0.2, // 0, 0.2, ... 4.8
        momentumScore: 50,
      }),
    );
  }
  const bundle = buildRepoTop10(repos, "7d");
  assert.equal(bundle.items.length, 10);
  // Top item should be the highest cross-signal (index 24).
  assert.equal(bundle.items[0].slug, "org24/repo24");
  // Score should be normalised + capped at 5.
  for (const item of bundle.items) {
    assert.ok(item.score >= 0 && item.score <= 5);
  }
  // Ranks are 1..10 in order.
  assert.deepEqual(
    bundle.items.map((it) => it.rank),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
});

test("buildRepoTop10: badges reflect channelsFiring + breakout", () => {
  const repos = [
    makeRepo({
      fullName: "five/firing",
      name: "firing",
      owner: "five",
      crossSignalScore: 5,
      channelsFiring: 5,
    }),
    makeRepo({
      fullName: "four/firing",
      name: "firing",
      owner: "four",
      crossSignalScore: 4,
      channelsFiring: 4,
    }),
    makeRepo({
      fullName: "three/firing",
      name: "firing",
      owner: "three",
      crossSignalScore: 3,
      channelsFiring: 3,
    }),
    makeRepo({
      fullName: "hot/breakout",
      name: "breakout",
      owner: "hot",
      crossSignalScore: 2,
      channelsFiring: 2,
      movementStatus: "breakout",
    }),
    makeRepo({
      fullName: "quiet/repo",
      name: "repo",
      owner: "quiet",
      crossSignalScore: 1,
      channelsFiring: 1,
    }),
  ];
  const bundle = buildRepoTop10(repos, "7d");
  assert.deepEqual(bundle.items[0].badges, ["FIRING_5"]);
  assert.deepEqual(bundle.items[1].badges, ["FIRING_4"]);
  assert.deepEqual(bundle.items[2].badges, ["FIRING_3"]);
  assert.deepEqual(bundle.items[3].badges, ["HOT"]);
  assert.deepEqual(bundle.items[4].badges, []);
});

test("buildRepoTop10: filters out archived/deleted", () => {
  const repos = [
    makeRepo({
      fullName: "a/active",
      name: "active",
      owner: "a",
      crossSignalScore: 4,
    }),
    makeRepo({
      fullName: "z/zombie",
      name: "zombie",
      owner: "z",
      crossSignalScore: 5,
      archived: true,
    }),
    makeRepo({
      fullName: "g/gone",
      name: "gone",
      owner: "g",
      crossSignalScore: 5,
      deleted: true,
    }),
  ];
  const bundle = buildRepoTop10(repos, "7d");
  assert.equal(bundle.items.length, 1);
  assert.equal(bundle.items[0].slug, "a/active");
});

// ---------------------------------------------------------------------------
// MOVERS
// ---------------------------------------------------------------------------

test("buildMoversTop10: sorts by 24h delta % and excludes <100-star repos", () => {
  const repos = [
    makeRepo({
      fullName: "a/big",
      name: "big",
      owner: "a",
      stars: 10_000,
      starsDelta24h: 200, // 2% of (10000-200)
    }),
    makeRepo({
      fullName: "b/small",
      name: "small",
      owner: "b",
      stars: 50, // filtered out
      starsDelta24h: 25,
    }),
    makeRepo({
      fullName: "c/rocket",
      name: "rocket",
      owner: "c",
      stars: 1_000,
      starsDelta24h: 200, // 25% of (1000-200)
    }),
  ];
  const bundle = buildMoversTop10(repos, "24h");
  assert.equal(bundle.items.length, 2);
  // Highest pct first.
  assert.equal(bundle.items[0].slug, "c/rocket");
  assert.ok((bundle.items[0].deltaPct ?? 0) > (bundle.items[1].deltaPct ?? 0));
});

// ---------------------------------------------------------------------------
// LLMS
// ---------------------------------------------------------------------------

test("buildLlmTop10: top 10, score normalised to 0–5, no deltas", () => {
  const models: HfModelTrending[] = [];
  for (let i = 0; i < 15; i++) {
    models.push({
      id: `org${i}/model${i}`,
      author: `org${i}`,
      url: `https://huggingface.co/org${i}/model${i}`,
      downloads: 100 - i,
      likes: 10,
      trendingScore: 1,
      pipelineTag: "text-generation",
      libraryName: "transformers",
      tags: [],
      createdAt: null,
      lastModified: null,
      rawScore: 80 - i * 4,
      momentum: 100 - i * 7,
      primaryMetric: { name: "downloads", value: 100, label: "downloads" },
      explanation: "",
    });
  }
  const bundle = buildLlmTop10(models, "7d");
  assert.equal(bundle.items.length, 10);
  for (const item of bundle.items) {
    assert.ok(item.score >= 0 && item.score <= 5);
    assert.equal(item.deltaPct, undefined);
    assert.equal(item.sparkline, undefined);
  }
  assert.deepEqual(bundle.supportedWindows, ["7d"]);
});

// ---------------------------------------------------------------------------
// MCPS / SKILLS via EcosystemBoard
// ---------------------------------------------------------------------------

function ecoItem(
  i: number,
  signalScore: number,
  cross: number,
): EcosystemLeaderboardItem {
  return {
    id: `mcp-${i}`,
    title: `vendor/server-${i}`,
    url: `https://example.com/${i}`,
    author: `vendor`,
    rank: i,
    description: `MCP server ${i}`,
    topic: "mcp",
    tags: [],
    agents: [],
    linkedRepo: null,
    popularity: 0,
    popularityLabel: "0",
    signalScore,
    postedAt: null,
    sourceLabel: "smithery",
    vendor: null,
    logoUrl: null,
    brandColor: null,
    verified: false,
    crossSourceCount: cross,
  };
}

test("buildMcpTop10: top 10, badges from crossSourceCount, score 0–5", () => {
  const board: EcosystemBoard = {
    id: "mcp",
    kind: "mcp",
    label: "MCPs",
    key: "mcp",
    fetchedAt: null,
    source: "memory",
    ageMs: 0,
    items: [
      ecoItem(1, 100, 4),
      ecoItem(2, 80, 3),
      ecoItem(3, 60, 2),
      ecoItem(4, 40, 1),
    ],
    meta: {},
  };
  const bundle = buildMcpTop10(board, "7d");
  assert.equal(bundle.items.length, 4);
  assert.deepEqual(bundle.items[0].badges, ["FIRING_5"]);
  assert.deepEqual(bundle.items[1].badges, ["FIRING_4"]);
  assert.deepEqual(bundle.items[2].badges, ["FIRING_3"]);
  assert.deepEqual(bundle.items[3].badges, []);
  assert.equal(bundle.items[0].score, 5);
  assert.equal(bundle.items[3].score, 2);
});

test("buildSkillsTop10: handles null board safely", () => {
  const bundle = buildSkillsTop10(null, "7d");
  assert.equal(bundle.items.length, 0);
});

// ---------------------------------------------------------------------------
// NEWS fusion
// ---------------------------------------------------------------------------

test("buildNewsTop10: dedupes by canonical URL and caps at 10", () => {
  const sharedUrl = "https://example.com/anthropic-skills-2";
  const hn: HnStory[] = [
    {
      id: 1,
      title: "Anthropic Skills 2 (HN)",
      url: sharedUrl,
      by: "alice",
      score: 500,
      descendants: 100,
      createdUtc: 1_700_000_000,
      everHitFrontPage: true,
      trendingScore: 800,
    },
  ];
  const lobsters: LobstersStory[] = [
    {
      shortId: "abc",
      title: "Anthropic Skills 2 (Lobsters)",
      url: sharedUrl, // dupe
      commentsUrl: "",
      by: "bob",
      score: 50,
      commentCount: 5,
      createdUtc: 1_700_000_000,
      trendingScore: 80,
    },
  ];
  const devto: DevtoArticle[] = [];
  const bsky: BskyPost[] = [];
  const ph: Launch[] = [];

  const bundle = buildNewsTop10({
    hn,
    bluesky: bsky,
    devto,
    lobsters,
    producthunt: ph,
  });
  assert.equal(bundle.items.length, 1);
});

test("buildNewsTop10: caps at 10 when all sources crowded", () => {
  const hn: HnStory[] = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    title: `Story ${i}`,
    url: `https://hn.example/${i}`,
    by: "u",
    score: 100 + i,
    descendants: 0,
    createdUtc: 1_700_000_000,
    everHitFrontPage: true,
    trendingScore: 100 + i,
  }));
  const bundle = buildNewsTop10({
    hn,
    bluesky: [],
    devto: [],
    lobsters: [],
    producthunt: [],
  });
  assert.equal(bundle.items.length, 10);
});

// ---------------------------------------------------------------------------
// FUNDING
// ---------------------------------------------------------------------------

function makeSignal(
  id: string,
  amount: number | null,
  publishedAt: string,
): FundingSignal {
  return {
    id,
    headline: `${id.toUpperCase()} raises round`,
    description: "",
    sourceUrl: `https://example.com/${id}`,
    sourcePlatform: "techcrunch",
    publishedAt,
    discoveredAt: publishedAt,
    extracted:
      amount !== null
        ? {
            companyName: id,
            companyWebsite: null,
            companyLogoUrl: null,
            amount,
            amountDisplay: amount > 0 ? `$${amount}M` : "Undisclosed",
            currency: "USD",
            roundType: "Series A",
            investors: [],
            investorsEnriched: [],
            confidence: "high",
          }
        : null,
    tags: [],
  } as FundingSignal;
}

test("buildFundingTop10: sorts by amount desc, top item first", () => {
  const signals = [
    makeSignal("alpha", 5, "2026-04-25T00:00:00Z"),
    makeSignal("beta", 100, "2026-04-26T00:00:00Z"),
    makeSignal("gamma", 50, "2026-04-27T00:00:00Z"),
  ];
  const bundle = buildFundingTop10(signals);
  assert.equal(bundle.items[0].title, "beta");
  assert.equal(bundle.items[1].title, "gamma");
  assert.equal(bundle.items[2].title, "alpha");
  // Top item gets HOT
  assert.deepEqual(bundle.items[0].badges, ["HOT"]);
});

// ---------------------------------------------------------------------------
// emptyBundle
// ---------------------------------------------------------------------------

test("emptyBundle: shape is renderable", () => {
  const b = emptyBundle("7d");
  assert.equal(b.items.length, 0);
  assert.equal(b.window, "7d");
  assert.equal(b.meta.totalMovement, "—");
  assert.equal(b.meta.coldest, null);
});
