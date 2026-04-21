// Bluesky loader view tests — mirrors hackernews-view.test.ts.
//
// The live data on disk is whatever the last scraper run committed; tests
// only assert shape + invariants that MUST hold regardless of the current
// content (case-insensitive lookup, href derivation, leaderboard sort).
// That keeps the tests stable across hourly GHA snapshot commits.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  blueskyCold,
  bskyPostHref,
  getAllBlueskyMentions,
  getBlueskyFile,
  getBlueskyLeaderboard,
  getBlueskyMentions,
  repoFullNameToHref,
} from "../../bluesky";
import {
  BLUESKY_TRENDING_KEYWORDS,
  getBlueskyPostsByKeyword,
  getBlueskyTopPosts,
  getBlueskyTrendingFile,
} from "../../bluesky-trending";

test("getBlueskyFile: has required top-level shape", () => {
  const file = getBlueskyFile();
  assert.equal(typeof file.fetchedAt, "string");
  assert.equal(typeof file.windowDays, "number");
  assert.equal(typeof file.searchQuery, "string");
  assert.ok(file.mentions && typeof file.mentions === "object");
  assert.ok(Array.isArray(file.leaderboard));
});

test("getBlueskyMentions: null for unknown repo", () => {
  assert.equal(getBlueskyMentions("definitely/not-a-real-repo-xyz-456"), null);
});

test("getBlueskyMentions: case-insensitive lookup", () => {
  const lb = getBlueskyLeaderboard();
  if (lb.length === 0) return; // cold start — skip
  const fullName = lb[0].fullName;
  const lower = getBlueskyMentions(fullName);
  const upper = getBlueskyMentions(fullName.toUpperCase());
  assert.ok(lower, "lowercase lookup should find bucket");
  assert.ok(upper, "uppercase lookup should find bucket");
  assert.equal(upper, lower, "case variants should resolve to same bucket");
});

test("getBlueskyMentions: returns well-shaped bucket for known repo", () => {
  const lb = getBlueskyLeaderboard();
  if (lb.length === 0) return;
  const bucket = getBlueskyMentions(lb[0].fullName);
  assert.ok(bucket);
  assert.equal(typeof bucket!.count7d, "number");
  assert.equal(typeof bucket!.likesSum7d, "number");
  assert.equal(typeof bucket!.repostsSum7d, "number");
  assert.ok(Array.isArray(bucket!.posts));
});

test("getBlueskyLeaderboard: rows sorted by likesSum7d desc then count7d desc", () => {
  const rows = getBlueskyLeaderboard();
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];
    if (prev.likesSum7d === curr.likesSum7d) {
      assert.ok(
        prev.count7d >= curr.count7d,
        `tie on likes, row ${i - 1} count (${prev.count7d}) should be >= row ${i} (${curr.count7d})`,
      );
    } else {
      assert.ok(
        prev.likesSum7d >= curr.likesSum7d,
        `row ${i - 1} likes (${prev.likesSum7d}) should be >= row ${i} (${curr.likesSum7d})`,
      );
    }
  }
});

test("getAllBlueskyMentions: every bucket has non-negative counts", () => {
  for (const [full, bucket] of Object.entries(getAllBlueskyMentions())) {
    assert.ok(bucket.count7d >= 0, `${full} count7d must be non-negative`);
    assert.ok(bucket.likesSum7d >= 0, `${full} likesSum7d must be non-negative`);
    assert.ok(Array.isArray(bucket.posts));
  }
});

test("bskyPostHref: builds canonical bsky.app URL from at:// uri", () => {
  const href = bskyPostHref(
    "at://did:plc:abc/app.bsky.feed.post/3kxyz",
    "alice.bsky.social",
  );
  assert.equal(href, "https://bsky.app/profile/alice.bsky.social/post/3kxyz");
});

test("bskyPostHref: falls back to 'unknown' when handle is empty", () => {
  const href = bskyPostHref("at://did:plc:abc/app.bsky.feed.post/3kxyz", "");
  assert.equal(href, "https://bsky.app/profile/unknown/post/3kxyz");
});

test("repoFullNameToHref: owner/name → /repo/owner/name", () => {
  assert.equal(repoFullNameToHref("foo/bar"), "/repo/foo/bar");
});

test("blueskyCold + fetchedAt: cold iff fetchedAt is null", () => {
  if (blueskyCold) {
    assert.equal(getBlueskyFile().fetchedAt, "1970-01-01T00:00:00.000Z");
  } else {
    const file = getBlueskyFile();
    assert.notEqual(file.fetchedAt, "1970-01-01T00:00:00.000Z");
  }
});

test("getBlueskyTrendingFile: has keywords + posts", () => {
  const file = getBlueskyTrendingFile();
  assert.ok(Array.isArray(file.keywords));
  assert.ok(Array.isArray(file.posts));
  assert.equal(typeof file.fetchedAt, "string");
});

test("BLUESKY_TRENDING_KEYWORDS: exported keywords match file", () => {
  const file = getBlueskyTrendingFile();
  assert.deepEqual([...BLUESKY_TRENDING_KEYWORDS], file.keywords ?? []);
});

test("getBlueskyTopPosts(10): <=10 posts sorted by trendingScore desc", () => {
  const posts = getBlueskyTopPosts(10);
  assert.ok(posts.length <= 10);
  for (let i = 1; i < posts.length; i++) {
    const prev = posts[i - 1].trendingScore ?? 0;
    const curr = posts[i].trendingScore ?? 0;
    assert.ok(
      prev >= curr,
      `post ${i - 1} trendingScore (${prev}) should be >= post ${i} (${curr})`,
    );
  }
});

test("getBlueskyPostsByKeyword: every returned post carries the matching keyword", () => {
  if (BLUESKY_TRENDING_KEYWORDS.length === 0) return;
  const keyword = BLUESKY_TRENDING_KEYWORDS[0];
  const posts = getBlueskyPostsByKeyword(keyword, 25);
  for (const p of posts) {
    assert.equal(
      (p.matchedKeyword ?? "").toLowerCase(),
      keyword.toLowerCase(),
      `expected post ${p.uri} to match keyword "${keyword}"`,
    );
  }
});
