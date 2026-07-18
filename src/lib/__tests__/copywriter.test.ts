// Copywriter validators (CE-5) — the paranoid fact-guard between an LLM
// rewrite and the timeline. Pure; polishTweet's network path is not mocked
// here (any failure returns null by design), only the no-key gate.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  extractNumericClaims,
  polishTweet,
  validatePolished,
  type PolishRequest,
} from "../llm/copywriter";

function req(partial?: Partial<PolishRequest>): PolishRequest {
  return {
    draft: "acme/hot - +2,341 stars today | TypeScript\n\nPicked up 2,341 stars in 24h (momentum 50/100) - acute breakout in progress.",
    mustInclude: ["acme/hot"],
    frozenLines: [],
    budget: 246,
    ...partial,
  };
}

test("extractNumericClaims grabs digit tokens and trims trailing punctuation", () => {
  assert.deepEqual(extractNumericClaims("Grew 2,341 stars, 50/100 score, v2.5.1 done."), [
    "2,341",
    "50",
    "100",
    "2.5.1",
  ]);
});

test("validatePolished accepts a faithful rewrite", () => {
  const out =
    "acme/hot just picked up 2,341 stars in 24h (momentum 50/100) - the breakout everyone will quote tomorrow.";
  assert.equal(validatePolished(req(), out), null);
});

test("validatePolished rejects lost numbers, lost repo names, and grown line counts", () => {
  assert.match(validatePolished(req(), "acme/hot is on fire today!") ?? "", /lost-number/);
  assert.match(
    validatePolished(req(), "Someone picked up 2,341 stars in 24h (momentum 50/100)!") ?? "",
    /lost-token/,
  );
  assert.match(
    validatePolished(req(), "acme/hot 2,341 50 100\nx\ny\nz\nw") ?? "",
    /line-count-grew/,
  );
});

test("validatePolished rejects emoji, rogue hashtags, mentions, and URLs", () => {
  const base = "acme/hot 2,341 stars in 24h, momentum 50/100";
  assert.match(validatePolished(req(), `${base} 🚀`) ?? "", /non-ascii/);
  assert.match(validatePolished(req(), `${base} #crypto`) ?? "", /hashtag-not-allowlisted/);
  assert.match(validatePolished(req(), `${base} @elon`) ?? "", /mention/);
  assert.match(validatePolished(req(), `${base} https://x.co/a`) ?? "", /url-in-text/);
});

test("validatePolished allows up to MAX_HASHTAGS allowlisted tags, case-insensitive", () => {
  const base = "acme/hot 2,341 stars in 24h, momentum 50/100";
  assert.equal(validatePolished(req(), `${base} #opensource`), null);
  assert.equal(validatePolished(req(), `${base} #GitHub #AI`), null);
  assert.match(validatePolished(req(), `${base} #github #ai #llm`) ?? "", /too-many-hashtags/);
  assert.match(validatePolished(req(), `${base} #github #vibes`) ?? "", /hashtag-not-allowlisted/);
});

test("validatePolished rejects over-budget output and mutated frozen lines", () => {
  assert.match(
    validatePolished(req({ budget: 20 }), "acme/hot 2,341 50 100 padded well past twenty") ?? "",
    /over-budget/,
  );
  const packReq = req({
    draft: "TOP 5 RAG REPOS\n\n1. a/b\n2. c/d",
    mustInclude: ["a/b", "c/d"],
    frozenLines: ["1. a/b", "2. c/d"],
  });
  assert.match(
    validatePolished(packReq, "TOP 5 RAG REPOS\n\n1. a/b\n2. d/c 5 2 1") ?? "",
    /mutated-line/,
  );
});

// --- polishTweet gate: no provider key -> null, no network ------------------

const KEYS = ["NANOGPT_API_KEY", "KIMI_API_KEY", "X_COPYWRITER"] as const;
const saved: Record<string, string | undefined> = {};
type MutableEnv = Record<string, string | undefined>;

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = (process.env as MutableEnv)[k];
    delete (process.env as MutableEnv)[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete (process.env as MutableEnv)[k];
    else (process.env as MutableEnv)[k] = saved[k];
  }
});

test("polishTweet returns null without a configured provider", async () => {
  assert.equal(await polishTweet(req()), null);
});

test("polishTweet returns null when X_COPYWRITER=0 even with a key", async () => {
  (process.env as MutableEnv).NANOGPT_API_KEY = "k";
  (process.env as MutableEnv).X_COPYWRITER = "0";
  assert.equal(await polishTweet(req()), null);
});
