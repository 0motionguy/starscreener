import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTwitterRowBadge,
  computeTwitterMetrics,
  computeTwitterScore,
  decideTwitterBadge,
  prepareTwitterPosts,
} from "../scoring";
import type { TwitterMatchedPost, TwitterRepoInput } from "../types";

const COMPLETED_AT = "2026-04-22T12:00:00.000Z";

const REPO: TwitterRepoInput = {
  repoId: "anthropic--claude-code",
  githubFullName: "anthropic/claude-code",
  githubUrl: "https://github.com/anthropic/claude-code",
  repoName: "claude-code",
  ownerName: "anthropic",
  homepageUrl: "https://claude.ai/code",
  docsUrl: "https://docs.anthropic.com/claude-code",
  packageNames: ["@anthropic-ai/claude-code"],
  aliases: ["Claude Code"],
  description: "Agentic coding CLI",
};

function post(
  id: string,
  overrides: Partial<TwitterMatchedPost> = {},
): TwitterMatchedPost {
  return {
    postId: id,
    postUrl: `https://x.com/test/status/${id}`,
    authorHandle: `author-${id}`,
    postedAt: "2026-04-22T10:00:00.000Z",
    text: `Check this out https://github.com/anthropic/claude-code ${id}`,
    likes: 100,
    reposts: 20,
    replies: 5,
    quotes: 2,
    matchedBy: "url",
    confidence: "high",
    matchedTerms: ["anthropic/claude-code"],
    whyMatched: "Exact GitHub repo URL present.",
    sourceQuery: "anthropic/claude-code",
    sourceQueryType: "repo_slug",
    ...overrides,
  };
}

test("strong exact matches across multiple authors earn the breakout badge", () => {
  const posts = prepareTwitterPosts(REPO, [
    post("1", { authorHandle: "alice", likes: 400, reposts: 80 }),
    post("2", { authorHandle: "bob", postedAt: "2026-04-22T09:00:00.000Z" }),
    post("3", { authorHandle: "cara", postedAt: "2026-04-22T08:00:00.000Z" }),
    post("4", { authorHandle: "dave", postedAt: "2026-04-22T07:00:00.000Z" }),
    post("5", { authorHandle: "erin", postedAt: "2026-04-22T06:00:00.000Z" }),
    post("6", { authorHandle: "fran", postedAt: "2026-04-22T05:00:00.000Z" }),
    post("7", { authorHandle: "gabe", postedAt: "2026-04-22T04:00:00.000Z" }),
    post("8", { authorHandle: "hana", postedAt: "2026-04-22T03:00:00.000Z" }),
  ]);

  const metrics = computeTwitterMetrics(posts, COMPLETED_AT);
  const score = computeTwitterScore(metrics);
  const badge = decideTwitterBadge(metrics, score);
  const rowBadge = buildTwitterRowBadge(badge, metrics, score);

  assert.equal(metrics.mentionCount24h, 8);
  assert.equal(metrics.uniqueAuthors24h, 8);
  assert.equal(badge.state, "x_fire");
  assert.ok(score.finalTwitterScore >= 70);
  assert.equal(rowBadge.showBadge, true);
  assert.equal(rowBadge.isBreakout, true);
});

test("generic-name alias-only matches are suppressed and do not earn a badge", () => {
  const genericRepo: TwitterRepoInput = {
    ...REPO,
    repoId: "acme--app",
    githubFullName: "acme/app",
    githubUrl: "https://github.com/acme/app",
    repoName: "app",
    ownerName: "acme",
    homepageUrl: null,
    docsUrl: null,
    packageNames: [],
    aliases: ["app"],
  };

  const posts = prepareTwitterPosts(genericRepo, [
    post("generic-1", {
      authorHandle: "solo",
      text: "This app is cool",
      matchedBy: "alias",
      confidence: "low",
      matchedTerms: ["app"],
      whyMatched: "Loose alias match only.",
      sourceQuery: "app",
      sourceQueryType: "alias",
    }),
  ]);

  const metrics = computeTwitterMetrics(posts, COMPLETED_AT);
  const score = computeTwitterScore(metrics);
  const badge = decideTwitterBadge(metrics, score);

  assert.equal(posts.length, 0);
  assert.equal(metrics.mentionCount24h, 0);
  assert.equal(badge.state, "none");
  assert.ok(score.finalTwitterScore < 20);
});

test("single-author buzz is penalized even when raw engagement is high", () => {
  const posts = prepareTwitterPosts(REPO, [
    post("1", { authorHandle: "one-person", likes: 800, reposts: 200 }),
    post("2", {
      authorHandle: "one-person",
      postUrl: "https://x.com/test/status/2",
      postId: "2",
      likes: 500,
      reposts: 120,
      postedAt: "2026-04-22T08:00:00.000Z",
    }),
    post("3", {
      authorHandle: "one-person",
      postUrl: "https://x.com/test/status/3",
      postId: "3",
      likes: 400,
      reposts: 90,
      postedAt: "2026-04-22T06:00:00.000Z",
    }),
  ]);

  const metrics = computeTwitterMetrics(posts, COMPLETED_AT);
  const score = computeTwitterScore(metrics);

  assert.equal(metrics.dominantAuthorShare, 1);
  assert.ok(score.singleAuthorPenalty > 0);
  assert.ok(score.finalTwitterScore < score.baseScore);
});
