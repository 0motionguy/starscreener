// StarScreener Pipeline — Watchlist tests (P0.3)

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  isOnWatchlist,
  getWatchlistSet,
  getWatchlistSize,
  getWatchlistSlugs,
} from "../ingestion/watchlist";

test("watchlist contains the 7 canonical repos from gate 4", () => {
  assert.equal(isOnWatchlist("cline/cline"), true);
  assert.equal(isOnWatchlist("anthropics/claude-code"), true);
  assert.equal(isOnWatchlist("modelcontextprotocol/servers"), true);
  assert.equal(isOnWatchlist("mem0ai/mem0"), true);
  assert.equal(isOnWatchlist("letta-ai/letta"), true);
  assert.equal(isOnWatchlist("All-Hands-AI/OpenHands"), true);
  assert.equal(isOnWatchlist("huggingface/smolagents"), true);
});

test("watchlist match is case-insensitive (owner rename resilience)", () => {
  // GitHub owner/repo casing drifts after renames. Membership must be
  // case-insensitive so "all-hands-ai/openhands" and "ALL-HANDS-AI/OpenHands"
  // resolve to the same entry.
  assert.equal(isOnWatchlist("all-hands-ai/openhands"), true);
  assert.equal(isOnWatchlist("ALL-HANDS-AI/OPENHANDS"), true);
  assert.equal(isOnWatchlist("CLINE/CLINE"), true);
});

test("watchlist rejects non-watchlist repos", () => {
  assert.equal(isOnWatchlist("vercel/next.js"), false);
  assert.equal(isOnWatchlist("facebook/react"), false);
  assert.equal(isOnWatchlist("fake/non-existent"), false);
});

test("watchlist has ~122 curated entries (PLAN.md target 100+)", () => {
  const size = getWatchlistSize();
  assert.ok(
    size >= 100 && size <= 200,
    `expected ~122 watchlist slugs, got ${size}`,
  );
});

test("getWatchlistSet returns a Set with the exact entry count", () => {
  const set = getWatchlistSet();
  assert.ok(set instanceof Set);
  assert.equal(set.size, getWatchlistSize());
});

test("getWatchlistSlugs returns canonical casing (not lowercased)", () => {
  const slugs = getWatchlistSlugs();
  // "All-Hands-AI/OpenHands" is the canonical casing per GitHub.
  assert.ok(slugs.includes("All-Hands-AI/OpenHands"));
});
