// Tests for src/lib/agent-commerce/scoring.ts.
//
// The composite formula must be stable across releases — if a weight
// drifts, every cached score in Redis becomes wrong. These tests pin
// expected outputs at boundary cases (all-zero, all-max, hype trigger,
// hype no-trigger, AISO null prior).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  calcComposite,
  calcHypePenalty,
  clamp01to100,
  compareByComposite,
  scoreApiClarity,
  scoreGithubVelocity,
  scorePricingClarity,
  scoreSocialMentions,
  scoreItem,
} from "../agent-commerce/scoring";
import type {
  AgentCommerceItem,
  AgentCommerceSourceRef,
} from "../agent-commerce/types";

// ---------------------------------------------------------------------------
// clamp
// ---------------------------------------------------------------------------

test("clamp01to100 clamps below 0 → 0", () => {
  assert.equal(clamp01to100(-5), 0);
  assert.equal(clamp01to100(-0.0001), 0);
});

test("clamp01to100 clamps above 100 → 100", () => {
  assert.equal(clamp01to100(101), 100);
  assert.equal(clamp01to100(99999), 100);
});

test("clamp01to100 returns 0 for non-finite", () => {
  assert.equal(clamp01to100(NaN), 0);
  assert.equal(clamp01to100(Infinity), 0);
});

// ---------------------------------------------------------------------------
// scoreGithubVelocity
// ---------------------------------------------------------------------------

test("scoreGithubVelocity 0 stars → 0", () => {
  assert.equal(scoreGithubVelocity(0), 0);
  assert.equal(scoreGithubVelocity(-10), 0);
});

test("scoreGithubVelocity log-scales: 999 stars → ~100", () => {
  assert.ok(scoreGithubVelocity(999) > 95);
  assert.ok(scoreGithubVelocity(999) <= 100);
});

test("scoreGithubVelocity is monotonic", () => {
  const a = scoreGithubVelocity(10);
  const b = scoreGithubVelocity(100);
  const c = scoreGithubVelocity(1000);
  assert.ok(a < b);
  assert.ok(b < c);
});

// ---------------------------------------------------------------------------
// scoreSocialMentions
// ---------------------------------------------------------------------------

function ref(
  source: AgentCommerceSourceRef["source"],
  signalScore: number,
): AgentCommerceSourceRef {
  return { source, url: "https://example.com", signalScore, capturedAt: "2026-04-30T00:00:00Z" };
}

test("scoreSocialMentions empty → 0", () => {
  assert.equal(scoreSocialMentions([]), 0);
});

test("scoreSocialMentions only counts hn/reddit/bluesky", () => {
  const onlyGithub = scoreSocialMentions([ref("github", 100), ref("npm", 100)]);
  assert.equal(onlyGithub, 0);
});

test("scoreSocialMentions sums signal scores from social sources", () => {
  const a = scoreSocialMentions([ref("hn", 50)]);
  const b = scoreSocialMentions([ref("hn", 50), ref("reddit", 50)]);
  assert.ok(b > a);
});

// ---------------------------------------------------------------------------
// scorePricingClarity
// ---------------------------------------------------------------------------

test("scorePricingClarity unknown → 0", () => {
  assert.equal(scorePricingClarity({ type: "unknown" }), 0);
});

test("scorePricingClarity type-only → 50", () => {
  assert.equal(scorePricingClarity({ type: "free" }), 50);
  assert.equal(scorePricingClarity({ type: "per_call" }), 50);
});

test("scorePricingClarity type+value → 75", () => {
  assert.equal(scorePricingClarity({ type: "per_call", value: "$0.01/call" }), 75);
});

test("scorePricingClarity type+value+currency+chain → 100 (full x402 disclosure)", () => {
  assert.equal(
    scorePricingClarity({
      type: "per_call",
      value: "$0.01/call",
      currency: "USD",
      chains: ["base"],
    }),
    100,
  );
});

// ---------------------------------------------------------------------------
// scoreApiClarity
// ---------------------------------------------------------------------------

test("scoreApiClarity empty → 0", () => {
  assert.equal(scoreApiClarity({}), 0);
});

test("scoreApiClarity each surface adds 25", () => {
  assert.equal(scoreApiClarity({ github: "owner/name" }), 25);
  assert.equal(scoreApiClarity({ github: "x", docs: "y" }), 50);
  assert.equal(
    scoreApiClarity({ github: "x", docs: "y", portalManifest: "z" }),
    75,
  );
  assert.equal(
    scoreApiClarity({
      github: "x",
      docs: "y",
      portalManifest: "z",
      callEndpoint: "w",
    }),
    100,
  );
});

// ---------------------------------------------------------------------------
// hype penalty
// ---------------------------------------------------------------------------

test("calcHypePenalty 0 when social mentions <60", () => {
  assert.equal(
    calcHypePenalty({ socialMentions: 50, githubVelocity: 0, pricingClarity: 0 }),
    0,
  );
});

test("calcHypePenalty 0 when github velocity >20 (substance present)", () => {
  assert.equal(
    calcHypePenalty({ socialMentions: 80, githubVelocity: 25, pricingClarity: 0 }),
    0,
  );
});

test("calcHypePenalty 0 when pricingClarity >25 (real product)", () => {
  assert.equal(
    calcHypePenalty({ socialMentions: 80, githubVelocity: 0, pricingClarity: 50 }),
    0,
  );
});

test("calcHypePenalty triggers when buzz > substance + no pricing", () => {
  const p = calcHypePenalty({ socialMentions: 80, githubVelocity: 5, pricingClarity: 0 });
  assert.ok(p > 0);
  assert.ok(p <= 30);
});

test("calcHypePenalty caps at 30", () => {
  const p = calcHypePenalty({ socialMentions: 100, githubVelocity: 0, pricingClarity: 0 });
  assert.equal(p, 30);
});

// ---------------------------------------------------------------------------
// composite
// ---------------------------------------------------------------------------

test("calcComposite all-zero with neutral AISO prior → ~7-8 (15% × 50)", () => {
  const c = calcComposite({
    githubVelocity: 0,
    socialMentions: 0,
    pricingClarity: 0,
    apiClarity: 0,
    aisoScore: null,
    portalReady: 0,
    verified: false,
    hypePenalty: 0,
  });
  // 0.15 * 50 = 7.5 → rounded → 8
  assert.equal(c, 8);
});

test("calcComposite all-max + verified → 100", () => {
  const c = calcComposite({
    githubVelocity: 100,
    socialMentions: 100,
    pricingClarity: 100,
    apiClarity: 100,
    aisoScore: 100,
    portalReady: 100,
    verified: true,
    hypePenalty: 0,
  });
  assert.equal(c, 100);
});

test("calcComposite hype penalty subtracts", () => {
  const base = calcComposite({
    githubVelocity: 0,
    socialMentions: 80,
    pricingClarity: 0,
    apiClarity: 0,
    aisoScore: null,
    portalReady: 0,
    verified: false,
    hypePenalty: 0,
  });
  const penalized = calcComposite({
    githubVelocity: 0,
    socialMentions: 80,
    pricingClarity: 0,
    apiClarity: 0,
    aisoScore: null,
    portalReady: 0,
    verified: false,
    hypePenalty: 20,
  });
  assert.equal(base - penalized, 20);
});

// ---------------------------------------------------------------------------
// scoreItem (full pass)
// ---------------------------------------------------------------------------

test("scoreItem returns all 8 fields", () => {
  const out = scoreItem({
    stars7dDelta: 100,
    sources: [ref("hn", 60)],
    pricing: { type: "per_call", value: "$0.01" },
    links: { github: "x", docs: "y" },
    badges: {
      portalReady: true,
      agentActionable: true,
      x402Enabled: true,
      mcpServer: false,
      verified: true,
    },
    aisoScore: 80,
  });
  assert.ok(typeof out.composite === "number");
  assert.ok(out.composite > 0 && out.composite <= 100);
  assert.equal(out.aisoScore, 80);
  assert.equal(out.portalReady, 100);
});

test("scoreItem aisoScore null is preserved (not promoted to neutral prior)", () => {
  const out = scoreItem({
    stars7dDelta: 0,
    sources: [],
    pricing: { type: "unknown" },
    links: {},
    badges: {
      portalReady: false,
      agentActionable: false,
      x402Enabled: false,
      mcpServer: false,
      verified: false,
    },
    aisoScore: null,
  });
  assert.equal(out.aisoScore, null);
  // composite uses neutral 50 prior internally
  assert.equal(out.composite, 8);
});

// ---------------------------------------------------------------------------
// compareByComposite (sort helper)
// ---------------------------------------------------------------------------

function makeItem(name: string, composite: number): AgentCommerceItem {
  return {
    id: `tool:${name}`,
    slug: name,
    name,
    brief: "",
    kind: "tool",
    category: "infra",
    protocols: [],
    pricing: { type: "unknown" },
    capabilities: [],
    links: {},
    badges: {
      portalReady: false,
      agentActionable: false,
      x402Enabled: false,
      mcpServer: false,
      verified: false,
    },
    scores: {
      composite,
      githubVelocity: 0,
      socialMentions: 0,
      pricingClarity: 0,
      apiClarity: 0,
      aisoScore: null,
      portalReady: 0,
      hypePenalty: 0,
    },
    sources: [],
    firstSeenAt: "2026-04-30T00:00:00Z",
    lastUpdatedAt: "2026-04-30T00:00:00Z",
    tags: [],
  };
}

test("compareByComposite sorts descending", () => {
  const items = [makeItem("a", 50), makeItem("b", 80), makeItem("c", 30)];
  items.sort(compareByComposite);
  assert.deepEqual(
    items.map((i) => i.name),
    ["b", "a", "c"],
  );
});
