import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getHnLeaderboard,
  getHnMentions,
  hnItemHref,
  repoFullNameToHref,
} from "../../hackernews";
import { getHnTopStories } from "../../hackernews-trending";

test("getHnMentions returns null for unknown repo", () => {
  assert.equal(getHnMentions("definitely/not-a-real-repo-xyz-123"), null);
});

test("getHnMentions returns the right bucket for a known repo", () => {
  const leaderboard = getHnLeaderboard();
  assert.ok(leaderboard.length > 0, "leaderboard should be non-empty");
  const fullName = leaderboard[0].fullName;
  const bucket = getHnMentions(fullName);
  assert.ok(bucket, `expected a bucket for ${fullName}`);
  assert.equal(typeof bucket!.count7d, "number");
  assert.equal(typeof bucket!.scoreSum7d, "number");
  assert.ok(Array.isArray(bucket!.stories));
});

test("getHnMentions is case-insensitive", () => {
  const leaderboard = getHnLeaderboard();
  assert.ok(leaderboard.length > 0, "leaderboard should be non-empty");
  const fullName = leaderboard[0].fullName;
  const lower = getHnMentions(fullName);
  const upper = getHnMentions(fullName.toUpperCase());
  assert.ok(lower, "lowercase lookup should find bucket");
  assert.ok(upper, "uppercase lookup should find bucket");
  assert.equal(upper, lower, "case variants should resolve to same bucket");
});

test("getHnLeaderboard returns rows sorted by scoreSum7d desc", () => {
  const rows = getHnLeaderboard();
  assert.ok(rows.length > 0, "leaderboard should be non-empty");
  for (let i = 1; i < rows.length; i++) {
    assert.ok(
      rows[i - 1].scoreSum7d >= rows[i].scoreSum7d,
      `row ${i - 1} (${rows[i - 1].scoreSum7d}) should be >= row ${i} (${rows[i].scoreSum7d})`,
    );
  }
});

test("getHnTopStories(10) returns ≤10 stories sorted by trendingScore desc, all with id defined", () => {
  const stories = getHnTopStories(10);
  assert.ok(stories.length <= 10, "should return at most 10 stories");
  for (const s of stories) {
    assert.equal(typeof s.id, "number");
    assert.ok(Number.isFinite(s.id));
  }
  for (let i = 1; i < stories.length; i++) {
    const prev = stories[i - 1].trendingScore ?? 0;
    const curr = stories[i].trendingScore ?? 0;
    assert.ok(
      prev >= curr,
      `story ${i - 1} trendingScore (${prev}) should be >= story ${i} (${curr})`,
    );
  }
});

test("hnItemHref(123) returns the canonical HN item URL", () => {
  assert.equal(
    hnItemHref(123),
    "https://news.ycombinator.com/item?id=123",
  );
});

test("repoFullNameToHref('foo/bar') returns /repo/foo/bar", () => {
  assert.equal(repoFullNameToHref("foo/bar"), "/repo/foo/bar");
});
