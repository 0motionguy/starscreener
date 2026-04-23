import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getTwitterAdminReview,
  getTwitterLeaderboard,
  getTwitterOverviewStats,
  getTwitterRepoSignal,
  getTwitterScanCandidates,
  ingestTwitterAgentFindings,
  ingestTwitterFindings,
  isTwitterIngestError,
} from "../service";
import { __resetTwitterStoreForTests } from "../storage";
import type {
  OpenClawTwitterFindingsPayload,
  TwitterIngestRequest,
} from "../types";

const PRIOR_ENV = {
  STARSCREENER_PERSIST: process.env.STARSCREENER_PERSIST,
  STARSCREENER_DATA_DIR: process.env.STARSCREENER_DATA_DIR,
};

function makeLegacyPayload(
  scanId: string,
  completedAt: string,
): OpenClawTwitterFindingsPayload {
  return {
    version: "v1",
    scanId,
    scanStatus: "completed",
    scanTriggeredBy: "trending_pipeline",
    scanWindowHours: 24,
    startedAt: "2026-04-22T11:30:00.000Z",
    completedAt,
    repo: {
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
    },
    queries: [
      {
        queryText: "anthropic/claude-code",
        queryType: "repo_slug",
        tier: 1,
        confidenceWeight: 1,
        enabled: true,
        rationale: "Exact repo slug",
      },
    ],
    posts: [
      {
        postId: `${scanId}-1`,
        postUrl: `https://x.com/a/status/${scanId}1`,
        authorHandle: "alice",
        authorAvatarUrl: "https://pbs.twimg.com/profile_images/alice/avatar.jpg",
        postedAt: "2026-04-22T11:00:00.000Z",
        text: "https://github.com/anthropic/claude-code is moving fast",
        likes: 120,
        reposts: 25,
        replies: 4,
        quotes: 3,
        matchedBy: "url",
        confidence: "high",
        matchedTerms: ["anthropic/claude-code"],
        whyMatched: "Exact GitHub URL present.",
        sourceQuery: "anthropic/claude-code",
        sourceQueryType: "repo_slug",
      },
      {
        postId: `${scanId}-2`,
        postUrl: `https://x.com/b/status/${scanId}2`,
        authorHandle: "bob",
        postedAt: "2026-04-22T10:00:00.000Z",
        text: "Claude Code is great",
        likes: 80,
        reposts: 15,
        replies: 2,
        quotes: 1,
        matchedBy: "phrase",
        confidence: "medium",
        matchedTerms: ["Claude Code", "anthropic"],
        whyMatched: "Project phrase plus owner context.",
        supportingContext: ["owner"],
        sourceQuery: "\"Claude Code\"",
        sourceQueryType: "project_name",
      },
      {
        postId: `${scanId}-3`,
        postUrl: `https://x.com/c/status/${scanId}3`,
        authorHandle: "cara",
        postedAt: "2026-04-22T09:00:00.000Z",
        text: "anthropic/claude-code shipped new updates",
        likes: 50,
        reposts: 12,
        replies: 1,
        quotes: 1,
        matchedBy: "repo_slug",
        confidence: "high",
        matchedTerms: ["anthropic/claude-code"],
        whyMatched: "Exact repo slug present.",
        sourceQuery: "anthropic/claude-code",
        sourceQueryType: "repo_slug",
      },
    ],
  };
}

function makeAgentRequest(
  scanId: string,
  completedAt: string,
): TwitterIngestRequest {
  const legacy = makeLegacyPayload(scanId, completedAt);
  return {
    version: "v1",
    source: "twitter",
    agent: {
      name: "openclaw-twitter-scan-agent",
      version: "1.0.0",
      runId: `run:${scanId}`,
    },
    repo: legacy.repo,
    scan: {
      scanId,
      scanType: "targeted_repo_scan",
      triggeredBy: legacy.scanTriggeredBy,
      windowHours: 24,
      startedAt: legacy.startedAt,
      completedAt,
      status: "completed",
    },
    queries: [
      {
        ...legacy.queries![0],
        matchCount: 17,
      },
    ],
    posts: legacy.posts,
    rawSummary: {
      candidatePostsSeen: 9,
      acceptedPosts: legacy.posts.length,
      rejectedPosts: 6,
    },
    observed: {
      metrics: {
        mentionCount24h: 3,
        finalTwitterScore: 40,
      },
      badge: {
        state: "x",
        reason: "Observed by the agent",
      },
      topPostIds: [`${scanId}-1`],
    },
  };
}

beforeEach(() => {
  process.env.STARSCREENER_PERSIST = "false";
  delete process.env.STARSCREENER_DATA_DIR;
  __resetTwitterStoreForTests();
});

afterEach(() => {
  if (PRIOR_ENV.STARSCREENER_PERSIST === undefined) {
    delete process.env.STARSCREENER_PERSIST;
  } else {
    process.env.STARSCREENER_PERSIST = PRIOR_ENV.STARSCREENER_PERSIST;
  }

  if (PRIOR_ENV.STARSCREENER_DATA_DIR === undefined) {
    delete process.env.STARSCREENER_DATA_DIR;
  } else {
    process.env.STARSCREENER_DATA_DIR = PRIOR_ENV.STARSCREENER_DATA_DIR;
  }

  __resetTwitterStoreForTests();
});

test("ingestTwitterAgentFindings stores canonical computed results and replays idempotently", async () => {
  const payload = makeAgentRequest("scan-1", "2026-04-22T12:00:00.000Z");

  const first = await ingestTwitterAgentFindings(payload, "openclaw-twitter");
  const second = await ingestTwitterAgentFindings(payload, "openclaw-twitter");
  const leaderboard = await getTwitterLeaderboard();
  const stats = await getTwitterOverviewStats();

  assert.equal(first.idempotentReplay, false);
  assert.equal(first.scan.summaryPromoted, true);
  assert.equal(first.counts.postsReceived, 3);
  assert.equal(first.counts.postsAccepted, 3);
  assert.equal(first.counts.postsRejected, 0);
  assert.equal(first.computed.mentionCount24h, 3);
  assert.equal(first.computed.totalLikes24h, 250);
  assert.equal(first.computed.badgeState, "x");

  assert.equal(second.idempotentReplay, true);
  assert.equal(second.ingestionId, first.ingestionId);

  assert.equal(leaderboard.length, 1);
  assert.equal(leaderboard[0].githubFullName, "anthropic/claude-code");
  assert.equal(leaderboard[0].githubUrl, "https://github.com/anthropic/claude-code");
  assert.equal(leaderboard[0].homepageUrl, "https://claude.ai/code");
  assert.equal(leaderboard[0].topMentionAuthors.length, 3);
  assert.equal(leaderboard[0].topMentionAuthors[0]?.authorHandle, "alice");
  assert.equal(leaderboard[0].topMentionAuthors[0]?.profileUrl, "https://x.com/alice");
  assert.equal(
    leaderboard[0].topMentionAuthors[0]?.avatarUrl,
    "https://pbs.twimg.com/profile_images/alice/avatar.jpg",
  );
  assert.equal(stats.totalMentions24h, 3);
  assert.equal(stats.totalLikes24h, 250);
  assert.equal(stats.totalReposts24h, 52);
  assert.equal(stats.topRepoFullName, "anthropic/claude-code");
  assert.equal(stats.topRepoScore, leaderboard[0].finalTwitterScore);
});

test("repo-level Twitter signal aggregates retained scans and ranks top mentions by engagement", async () => {
  const firstScan = makeAgentRequest("aggregate-a", "2026-04-22T12:00:00.000Z");
  const secondScan = makeAgentRequest("aggregate-b", "2026-04-22T12:05:00.000Z");

  secondScan.posts = [
    {
      ...firstScan.posts[0],
      likes: 1,
      reposts: 0,
      replies: 0,
      quotes: 0,
    },
    {
      postId: "aggregate-new-high",
      postUrl: "https://x.com/topdev/status/aggregate-new-high",
      authorHandle: "topdev",
      authorAvatarUrl: "https://pbs.twimg.com/profile_images/topdev/avatar.jpg",
      postedAt: "2026-04-22T12:01:00.000Z",
      text: "anthropic/claude-code is all over my timeline today",
      likes: 900,
      reposts: 100,
      replies: 12,
      quotes: 8,
      matchedBy: "repo_slug",
      confidence: "high",
      matchedTerms: ["anthropic/claude-code"],
      whyMatched: "Exact repo slug present.",
      sourceQuery: "anthropic/claude-code",
      sourceQueryType: "repo_slug",
    },
  ];
  secondScan.rawSummary = {
    candidatePostsSeen: secondScan.posts.length,
    acceptedPosts: secondScan.posts.length,
    rejectedPosts: 0,
  };

  await ingestTwitterAgentFindings(firstScan, "openclaw-twitter");
  await ingestTwitterAgentFindings(secondScan, "openclaw-twitter");

  const signal = await getTwitterRepoSignal("anthropic/claude-code");
  const leaderboard = await getTwitterLeaderboard();

  assert.ok(signal);
  assert.equal(signal?.latestScanId, "aggregate-b");
  assert.equal(signal?.metrics.mentionCount24h, 4);
  assert.equal(signal?.topPosts[0]?.postId, "aggregate-new-high");
  assert.equal(signal?.topMentionAuthors[0]?.authorHandle, "topdev");
  assert.equal(signal?.topMentionAuthors[0]?.postUrl, "https://x.com/topdev/status/aggregate-new-high");
  assert.equal(leaderboard[0].mentionCount24h, 4);
  assert.equal(leaderboard[0].topMentionAuthors[0]?.authorHandle, "topdev");
  assert.equal(
    leaderboard[0].topMentionAuthors[0]?.postUrl,
    "https://x.com/topdev/status/aggregate-new-high",
  );
});

test("getTwitterScanCandidates prioritizes known repos that have not been scanned", async () => {
  const candidates = await getTwitterScanCandidates(5);

  assert.equal(candidates.length, 5);
  assert.equal(candidates[0].priorityRank, 1);
  assert.ok(candidates[0].priorityScore > 0);
  assert.ok(candidates[0].priorityReason.includes("known TrendingRepo repo"));
  assert.match(candidates[0].repo.githubFullName, /^[^/]+\/[^/]+$/);
  assert.match(candidates[0].repo.githubUrl, /^https:\/\/github\.com\//);
});

test("reusing a scan id with a different payload raises an idempotency conflict", async () => {
  const original = makeAgentRequest("scan-conflict", "2026-04-22T12:00:00.000Z");
  const changed = makeAgentRequest("scan-conflict", "2026-04-22T12:00:00.000Z");
  changed.posts = [
    ...changed.posts,
    {
      postId: "scan-conflict-extra",
      postUrl: "https://x.com/d/status/scanconflictextra",
      authorHandle: "dana",
      postedAt: "2026-04-22T08:30:00.000Z",
      text: "anthropic/claude-code keeps shipping",
      likes: 30,
      reposts: 5,
      replies: 1,
      quotes: 0,
      matchedBy: "repo_slug",
      confidence: "high",
      matchedTerms: ["anthropic/claude-code"],
      whyMatched: "Exact repo slug present.",
      sourceQuery: "anthropic/claude-code",
      sourceQueryType: "repo_slug",
    },
  ];
  changed.rawSummary = {
    candidatePostsSeen: 10,
    acceptedPosts: changed.posts.length,
    rejectedPosts: 6,
  };

  await ingestTwitterAgentFindings(original, "openclaw-twitter");

  await assert.rejects(
    () => ingestTwitterAgentFindings(changed, "openclaw-twitter"),
    (error: unknown) =>
      isTwitterIngestError(error) && error.code === "IDEMPOTENCY_CONFLICT",
  );
});

test("older scans do not overwrite a newer repo-level signal", async () => {
  await ingestTwitterAgentFindings(
    makeAgentRequest("scan-new", "2026-04-22T12:00:00.000Z"),
    "openclaw-twitter",
  );
  const older = await ingestTwitterAgentFindings(
    makeAgentRequest("scan-old", "2026-04-22T10:00:00.000Z"),
    "openclaw-twitter",
  );

  const signal = await getTwitterRepoSignal("anthropic/claude-code");
  const review = await getTwitterAdminReview("anthropic/claude-code");

  assert.equal(older.scan.summaryPromoted, false);
  assert.ok(signal);
  assert.equal(signal?.latestScanId, "scan-new");
  assert.ok(review);
  assert.equal(review?.panel.summary.lastScannedAt, "2026-04-22T12:00:00.000Z");
});

test("legacy ingest route adapter still works", async () => {
  const result = await ingestTwitterFindings(
    makeLegacyPayload("legacy-scan", "2026-04-22T12:00:00.000Z"),
  );

  assert.equal(result.created, true);
  assert.equal(result.updated, false);
  assert.match(result.ingestionId, /^twi_/);
  assert.equal(result.signal.latestScanId, "legacy-scan");
});
