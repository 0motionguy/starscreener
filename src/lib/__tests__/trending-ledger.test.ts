// Tests for the durable-ledger math that backs the poster's 14-day cooldown +
// per-day cap. Pure functions — no Redis / network.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeLedgerState,
  appendLedgerPost,
  rankTrendingCandidates,
  utcDate,
  type TrendingLedger,
  type TrendingLedgerPost,
} from "../twitter/outbound/trending-runner";
import type { Repo } from "../types";

const NOW = Date.parse("2026-07-05T18:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function post(fullName: string, ms: number, tweetId?: string): TrendingLedgerPost {
  return {
    date: utcDate(ms),
    ts: new Date(ms).toISOString(),
    fullName,
    // Unique per row by default — real posts always carry distinct tweet ids.
    tweetId: tweetId ?? `t-${fullName}-${ms}`,
    text: "x",
  };
}

test("computeLedgerState puts repos posted within 14 days in cooldown", () => {
  const ledger: TrendingLedger = {
    posts: [
      post("acme/recent", NOW - 2 * DAY), // in window
      post("acme/old", NOW - 20 * DAY), // outside window
    ],
  };
  const state = computeLedgerState(ledger, NOW);
  assert.ok(state.cooldownFullNames.has("acme/recent"));
  assert.ok(!state.cooldownFullNames.has("acme/old"));
});

test("computeLedgerState uses lowercase cooldown identities", () => {
  const state = computeLedgerState(
    { posts: [post("Acme/Repo", NOW - DAY)] },
    NOW,
  );
  assert.ok(state.cooldownFullNames.has("acme/repo"));
  assert.ok(!state.cooldownFullNames.has("Acme/Repo"));
});

test("computeLedgerState counts only today's (UTC) posts for the cap", () => {
  const ledger: TrendingLedger = {
    posts: [
      post("a/1", NOW - 1 * 60 * 60 * 1000), // today
      post("a/2", NOW - 2 * 60 * 60 * 1000), // today
      post("a/3", NOW - 2 * DAY), // two days ago
    ],
  };
  assert.equal(computeLedgerState(ledger, NOW).postedTodayCount, 2);
});

test("computeLedgerState counts a pack (N rows, one tweetId) as ONE post toward the cap", () => {
  // v2: a 5-repo themed pack writes five ledger rows sharing a tweetId so
  // every member cools down — but it only burns one daily-cap slot.
  const members = ["p/1", "p/2", "p/3", "p/4", "p/5"];
  const ledger: TrendingLedger = {
    posts: members.map((m) => post(m, NOW - 60 * 60 * 1000, "tweet-pack-1")),
  };
  const state = computeLedgerState(ledger, NOW);
  assert.equal(state.postedTodayCount, 1);
  for (const m of members) {
    assert.ok(state.cooldownFullNames.has(m), `${m} should be cooling down`);
  }
});

test("computeLedgerState on an empty ledger is zero cooldown + zero count", () => {
  const state = computeLedgerState({ posts: [] }, NOW);
  assert.equal(state.cooldownFullNames.size, 0);
  assert.equal(state.postedTodayCount, 0);
});

test("appendLedgerPost appends and bounds the ledger to the last 500", () => {
  const many: TrendingLedger = {
    posts: Array.from({ length: 500 }, (_, i) => post(`a/${i}`, NOW - i * 60_000)),
  };
  const next = appendLedgerPost(many, post("a/new", NOW));
  assert.equal(next.posts.length, 500);
  assert.equal(next.posts.at(-1)?.fullName, "a/new");
  assert.equal(next.posts.some((p) => p.fullName === "a/0"), false); // oldest dropped
});

test("appendLedgerPost is idempotent by tweet id and case-insensitive repo name", () => {
  const first = post("Acme/Repo", NOW, "tweet-1");
  const duplicate = post("acme/repo", NOW + 1_000, "tweet-1");
  const ledger = { posts: [first] };
  const next = appendLedgerPost(ledger, duplicate);
  assert.equal(next.posts.length, 1);
  assert.equal(next.posts[0]?.fullName, "Acme/Repo");
  assert.equal(next, ledger);
});

function rankedRepo(fullName: string, d24: number, d7: number, d30: number): Repo {
  return {
    id: fullName,
    fullName,
    starsDelta24h: d24,
    starsDelta7d: d7,
    starsDelta30d: d30,
  } as Repo;
}

test("rankTrendingCandidates supports GAINER and sustained TREND order", () => {
  const spike = rankedRepo("acme/spike", 100, 100, 100);
  const climber = rankedRepo("acme/climber", 10, 80, 320);
  assert.equal(rankTrendingCandidates([climber, spike], "gainer")[0]?.fullName, "acme/spike");
  assert.equal(rankTrendingCandidates([spike, climber], "trend")[0]?.fullName, "acme/climber");
});

test("rankTrendingCandidates returns no GAINER when every 24h delta is non-positive", () => {
  const flat = rankedRepo("acme/flat", 0, 500, 500);
  const falling = rankedRepo("acme/falling", -1, 1_000, 1_000);
  assert.deepEqual(rankTrendingCandidates([flat, falling], "gainer"), []);
});
