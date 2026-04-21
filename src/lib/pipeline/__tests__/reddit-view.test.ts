import { test } from "node:test";
import assert from "node:assert/strict";

import type { RedditMentionsFile, RedditPost } from "../../reddit";
import {
  buildRedditStats,
  buildGlobalRedditPosts,
  repoFullNameToHref,
} from "../../reddit";

function makePost(overrides: Partial<RedditPost> & Pick<RedditPost, "id">): RedditPost {
  return {
    id: overrides.id,
    subreddit: overrides.subreddit ?? "ClaudeAI",
    title: overrides.title ?? "Test post",
    url: overrides.url ?? "https://example.com",
    permalink: overrides.permalink ?? "https://reddit.com/test",
    score: overrides.score ?? 1,
    numComments: overrides.numComments ?? 0,
    createdUtc: overrides.createdUtc ?? 1_700_000_000,
    author: overrides.author ?? "tester",
    repoFullName: overrides.repoFullName ?? "anthropics/claude-code",
    baselineRatio: overrides.baselineRatio,
    baselineTier: overrides.baselineTier,
    baselineConfidence: overrides.baselineConfidence,
    ageHours: overrides.ageHours,
    velocity: overrides.velocity,
    trendingScore: overrides.trendingScore,
  };
}

function makeFile(overrides: Partial<RedditMentionsFile> = {}): RedditMentionsFile {
  return {
    fetchedAt: overrides.fetchedAt ?? "2026-04-20T00:00:00.000Z",
    cold: overrides.cold ?? false,
    scannedSubreddits: overrides.scannedSubreddits ?? ["ClaudeAI"],
    scannedPostsTotal: overrides.scannedPostsTotal ?? 1,
    mentions: overrides.mentions ?? {},
    topPosts: overrides.topPosts ?? [],
    allPosts: overrides.allPosts,
    leaderboard: overrides.leaderboard,
  };
}

test("repoFullNameToHref builds the canonical repo route", () => {
  assert.equal(
    repoFullNameToHref("anthropics/claude-code"),
    "/repo/anthropics/claude-code",
  );
});

test("buildGlobalRedditPosts hydrates legacy posts missing baseline + velocity fields", () => {
  const legacy = makePost({
    id: "legacy-1",
    subreddit: "ClaudeAI",
    score: 8,
    createdUtc: 1_700_000_000,
    baselineRatio: undefined,
    baselineTier: undefined,
    baselineConfidence: undefined,
    ageHours: undefined,
    velocity: undefined,
    trendingScore: undefined,
  });

  const out = buildGlobalRedditPosts(
    makeFile({ allPosts: [legacy] }),
    1_700_003_600_000,
  );

  assert.equal(out.length, 1);
  assert.equal(typeof out[0].ageHours, "number");
  assert.equal(typeof out[0].velocity, "number");
  assert.equal(typeof out[0].trendingScore, "number");
  assert.ok(Number.isFinite(out[0].trendingScore));
  assert.ok(out[0].baselineTier !== undefined);
});

test("buildRedditStats uses unique global posts and primary-repo leaderboard data", () => {
  const sharedPrimary = makePost({
    id: "shared-1",
    repoFullName: "anthropics/claude-code",
    score: 9,
  });
  const duplicatedSecondary = makePost({
    id: "shared-1",
    repoFullName: "anthropics/skills",
    score: 9,
  });

  const file = makeFile({
    mentions: {
      "anthropics/claude-code": {
        count7d: 1,
        upvotes7d: 9,
        posts: [sharedPrimary],
      },
      "anthropics/skills": {
        count7d: 1,
        upvotes7d: 9,
        posts: [duplicatedSecondary],
      },
    },
    allPosts: [sharedPrimary],
    leaderboard: [
      {
        fullName: "anthropics/claude-code",
        count7d: 1,
        upvotes7d: 9,
      },
    ],
  });

  const stats = buildRedditStats(file);

  assert.equal(stats.totalMentions, 1);
  assert.equal(stats.reposWithMentions, 2);
  assert.deepEqual(stats.topRepos, [
    {
      fullName: "anthropics/claude-code",
      count7d: 1,
      upvotes7d: 9,
    },
  ]);
});

test("buildGlobalRedditPosts falls back to deduped mention buckets when allPosts is absent", () => {
  const primary = makePost({
    id: "shared-1",
    repoFullName: "anthropics/claude-code",
  });
  const duplicate = makePost({
    id: "shared-1",
    repoFullName: "anthropics/skills",
  });
  const unique = makePost({
    id: "unique-2",
    repoFullName: "openai/codex",
  });

  const out = buildGlobalRedditPosts(
    makeFile({
      mentions: {
        "anthropics/claude-code": {
          count7d: 1,
          upvotes7d: 1,
          posts: [primary],
        },
        "anthropics/skills": {
          count7d: 1,
          upvotes7d: 1,
          posts: [duplicate],
        },
        "openai/codex": {
          count7d: 1,
          upvotes7d: 1,
          posts: [unique],
        },
      },
    }),
    1_700_003_600_000,
  );

  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((p) => p.id).sort(),
    ["shared-1", "unique-2"],
  );
});
