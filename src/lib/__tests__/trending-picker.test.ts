// Tests for the pure trending-autopilot picker: dedupe (14d cooldown) + the
// per-day cap. No Redis / CLI — the runner injects state; this proves the
// selection math in isolation.

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Repo } from "../types";
import { selectTrendingPost } from "../twitter/outbound/trending-picker";

/** Minimal Repo — selectTrendingPost only reads `fullName`. */
function repo(fullName: string): Repo {
  return { fullName } as Repo;
}

const ranked = [repo("vercel/next.js"), repo("acme/two"), repo("acme/three")];

test("selectTrendingPost picks the top repo when nothing is cooling down", () => {
  const pick = selectTrendingPost(
    ranked,
    { cooldownFullNames: new Set(), postedTodayCount: 0 },
    3,
  );
  assert.equal(pick?.fullName, "vercel/next.js");
});

test("selectTrendingPost never picks a spam repo, even at the top of the list", () => {
  const withSpam = [repo("Lairmoprosper/Pinnacle-Studio-26-Crack"), ...ranked];
  const pick = selectTrendingPost(
    withSpam,
    { cooldownFullNames: new Set(), postedTodayCount: 0 },
    3,
  );
  assert.equal(pick?.fullName, "vercel/next.js");
});

test("selectTrendingPost skips cooled-down repos and picks the first eligible", () => {
  const pick = selectTrendingPost(
    ranked,
    { cooldownFullNames: new Set(["vercel/next.js", "acme/two"]), postedTodayCount: 1 },
    3,
  );
  assert.equal(pick?.fullName, "acme/three");
});

test("selectTrendingPost returns null when the per-day cap is already met", () => {
  const pick = selectTrendingPost(
    ranked,
    { cooldownFullNames: new Set(), postedTodayCount: 3 },
    3,
  );
  assert.equal(pick, null);
});

test("selectTrendingPost returns null when every ranked repo is cooling down", () => {
  const pick = selectTrendingPost(
    ranked,
    {
      cooldownFullNames: new Set(["vercel/next.js", "acme/two", "acme/three"]),
      postedTodayCount: 0,
    },
    3,
  );
  assert.equal(pick, null);
});

test("selectTrendingPost returns null for an empty ranked list", () => {
  const pick = selectTrendingPost(
    [],
    { cooldownFullNames: new Set(), postedTodayCount: 0 },
    3,
  );
  assert.equal(pick, null);
});
