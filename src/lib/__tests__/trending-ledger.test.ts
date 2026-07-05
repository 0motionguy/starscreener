// Tests for the durable-ledger math that backs the poster's 14-day cooldown +
// per-day cap. Pure functions — no Redis / network.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeLedgerState,
  appendLedgerPost,
  utcDate,
  type TrendingLedger,
  type TrendingLedgerPost,
} from "../twitter/outbound/trending-runner";

const NOW = Date.parse("2026-07-05T18:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function post(fullName: string, ms: number): TrendingLedgerPost {
  return { date: utcDate(ms), ts: new Date(ms).toISOString(), fullName, tweetId: "t", text: "x" };
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
