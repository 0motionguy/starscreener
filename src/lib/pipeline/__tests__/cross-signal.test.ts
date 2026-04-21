import { test } from "node:test";
import assert from "node:assert/strict";

import type { Repo } from "../../types";
import { attachCrossSignal, getChannelStatus, __test } from "../cross-signal";

const { githubComponent, hnComponent, blueskyComponent, devtoComponent } = __test;

// Minimal Repo factory — only the fields cross-signal touches need to be
// real. Everything else gets dummy values that satisfy the type.
function makeRepo(overrides: Partial<Repo> & Pick<Repo, "fullName">): Repo {
  const defaults = {
    id: overrides.id ?? overrides.fullName.replace(/\W+/g, "-"),
    name: overrides.fullName.split("/")[1] ?? "",
    owner: overrides.fullName.split("/")[0] ?? "",
  };
  return {
    ...defaults,
    ownerAvatarUrl: "",
    description: "",
    url: "",
    language: null,
    topics: [],
    categoryId: "other",
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// githubComponent: status → tier mapping
// ---------------------------------------------------------------------------

test("githubComponent: breakout=1.0, hot=0.7, rising=0.4, others=0", () => {
  assert.equal(githubComponent("breakout"), 1.0);
  assert.equal(githubComponent("hot"), 0.7);
  assert.equal(githubComponent("rising"), 0.4);
  assert.equal(githubComponent("stable"), 0);
  assert.equal(githubComponent("declining"), 0);
  assert.equal(githubComponent("cooling"), 0);
  assert.equal(githubComponent("quiet_killer"), 0);
  assert.equal(githubComponent(undefined), 0);
});

// ---------------------------------------------------------------------------
// hnComponent: works on real loader data
// ---------------------------------------------------------------------------

test("hnComponent: returns 0 for an unknown repo", () => {
  assert.equal(hnComponent("definitely/not-a-real-repo-xyz-123"), 0);
});

// ---------------------------------------------------------------------------
// blueskyComponent: tiered by count7d
// ---------------------------------------------------------------------------

test("blueskyComponent: returns 0 for an unknown repo", () => {
  assert.equal(blueskyComponent("definitely/not-a-real-repo-bsky-123"), 0);
});

// ---------------------------------------------------------------------------
// devtoComponent: tiered by count7d
// ---------------------------------------------------------------------------

test("devtoComponent: returns 0 for an unknown repo", () => {
  assert.equal(devtoComponent("definitely/not-a-real-repo-devto-123"), 0);
});

test("devtoComponent: real repo with mentions ≥1 lights at least 0.4", () => {
  // Pulled from live data: NousResearch/hermes-agent had count7d=3 on the
  // first scraper run. If the data file rotates and this repo loses
  // mentions later, swap for whichever leaderboard top-row currently exists.
  const score = devtoComponent("NousResearch/hermes-agent");
  assert.ok(score >= 0.4, `expected dev.to signal, got ${score}`);
});

// ---------------------------------------------------------------------------
// attachCrossSignal: shape + edge cases
// ---------------------------------------------------------------------------

test("attachCrossSignal: stable repo with no Reddit/HN data → score=0, firing=0", () => {
  const repos = [makeRepo({ fullName: "definitely/not-a-real-repo-xyz-123" })];
  const out = attachCrossSignal(repos);
  assert.equal(out.length, 1);
  assert.equal(out[0].crossSignalScore, 0);
  assert.equal(out[0].channelsFiring, 0);
});

test("attachCrossSignal: breakout-status repo always lights at least 1 channel", () => {
  const repos = [
    makeRepo({
      fullName: "definitely/not-a-real-repo-xyz-123",
      movementStatus: "breakout",
    }),
  ];
  const out = attachCrossSignal(repos);
  assert.equal(out[0].crossSignalScore, 1.0);
  assert.equal(out[0].channelsFiring, 1);
});

test("attachCrossSignal: cold-start (no reddit data) does not divide by zero", () => {
  // All repos have unknown fullName, so redditRaw is [0,0,0]. maxReddit
  // is 0, so the normalizer must short-circuit to 0 instead of NaN/Infinity.
  const repos = [
    makeRepo({ fullName: "ghost/repo-1" }),
    makeRepo({ fullName: "ghost/repo-2" }),
    makeRepo({ fullName: "ghost/repo-3" }),
  ];
  const out = attachCrossSignal(repos);
  for (const r of out) {
    assert.equal(r.crossSignalScore, 0);
    assert.equal(r.channelsFiring, 0);
    assert.ok(Number.isFinite(r.crossSignalScore!));
  }
});

test("attachCrossSignal: per-repo scores are rounded to 2 decimals", () => {
  const repos = [
    makeRepo({
      fullName: "ghost/repo",
      movementStatus: "rising", // 0.4
    }),
  ];
  const out = attachCrossSignal(repos);
  assert.equal(out[0].crossSignalScore, 0.4);
  // The round-2 contract: never emit floats with more than 2 decimal places.
  const str = String(out[0].crossSignalScore);
  const decimals = str.includes(".") ? str.split(".")[1].length : 0;
  assert.ok(decimals <= 2);
});

test("attachCrossSignal: real HN data — at least one repo lights HN channel", () => {
  // Pulled from the live data on disk: anthropics/claude-code has
  // count7d=5 in the hackernews-repo-mentions.json, so hnComponent is 0.7.
  const repos = [makeRepo({ fullName: "anthropics/claude-code" })];
  const out = attachCrossSignal(repos);
  assert.ok(
    (out[0].crossSignalScore ?? 0) >= 0.4,
    `expected anthropics/claude-code to have HN signal, got ${out[0].crossSignalScore}`,
  );
  assert.ok((out[0].channelsFiring ?? 0) >= 1);
});

// ---------------------------------------------------------------------------
// getChannelStatus: matches attachCrossSignal's per-channel decision
// ---------------------------------------------------------------------------

test("getChannelStatus: stable + unknown repo lights nothing", () => {
  const repo = makeRepo({ fullName: "definitely/not-a-real-repo-xyz-456" });
  const status = getChannelStatus(repo);
  assert.deepEqual(status, {
    github: false,
    reddit: false,
    hn: false,
    bluesky: false,
    devto: false,
  });
});

test("getChannelStatus: hot status lights github", () => {
  const repo = makeRepo({
    fullName: "definitely/not-a-real-repo-xyz-789",
    movementStatus: "hot",
  });
  const status = getChannelStatus(repo);
  assert.equal(status.github, true);
  assert.equal(status.reddit, false);
  assert.equal(status.hn, false);
  assert.equal(status.bluesky, false);
  assert.equal(status.devto, false);
});

test("attachCrossSignal: score + firing range is 0-5 (five channels)", () => {
  const repos = [
    makeRepo({
      fullName: "ghost/repo-breakout",
      movementStatus: "breakout",
    }),
  ];
  const out = attachCrossSignal(repos);
  assert.ok(
    (out[0].crossSignalScore ?? 0) <= 5.0,
    `score must be in 0..5, got ${out[0].crossSignalScore}`,
  );
  assert.ok(
    (out[0].channelsFiring ?? 0) <= 5,
    `firing count must be in 0..5, got ${out[0].channelsFiring}`,
  );
});

test("getChannelStatus: HN-mentioned real repo lights hn", () => {
  const repo = makeRepo({ fullName: "anthropics/claude-code" });
  const status = getChannelStatus(repo);
  assert.equal(status.hn, true);
});
