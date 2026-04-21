import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeFullName,
  extractRepoMentions,
  computeTrendingScore,
  stripPostText,
  normalizePost,
} from "../scrape-bluesky.mjs";
import {
  deriveBskyUrl,
  extractUrlsFromEmbed,
  extractUrlsFromFacets,
  collectPostUrls,
} from "../_bluesky-shared.mjs";

// ---------------------------------------------------------------------------
// normalizeFullName + extractRepoMentions (parity with HN helper contract)
// ---------------------------------------------------------------------------

test("normalizeFullName: lowercases and strips .git + trailing punctuation", () => {
  assert.equal(normalizeFullName("OpenAI", "Gym"), "openai/gym");
  assert.equal(normalizeFullName("foo", "bar.git"), "foo/bar");
  assert.equal(normalizeFullName("a", "b,"), "a/b");
  assert.equal(normalizeFullName("a", "b)."), "a/b");
});

test("extractRepoMentions: finds github.com links inside post text", () => {
  const text = "check out github.com/anthropics/claude-code and github.com/openai/gym";
  const tracked = new Map([
    ["anthropics/claude-code", "anthropics/claude-code"],
    ["openai/gym", "openai/gym"],
  ]);
  const lowerSet = new Set(tracked.keys());
  const hits = extractRepoMentions(text, lowerSet);
  assert.ok(hits.has("anthropics/claude-code"));
  assert.ok(hits.has("openai/gym"));
  assert.equal(hits.size, 2);
});

test("extractRepoMentions: excludes reserved owners (orgs, settings, etc)", () => {
  const text = "https://github.com/orgs/foo and https://github.com/settings/profile";
  const hits = extractRepoMentions(text, null);
  assert.equal(hits.size, 0);
});

// ---------------------------------------------------------------------------
// computeTrendingScore: likes + 2*reposts + 0.5*replies
// ---------------------------------------------------------------------------

test("computeTrendingScore: weighted sum of engagement signals", () => {
  assert.equal(computeTrendingScore(10, 0, 0), 10);
  assert.equal(computeTrendingScore(0, 5, 0), 10);
  assert.equal(computeTrendingScore(0, 0, 10), 5);
  assert.equal(computeTrendingScore(10, 5, 20), 30);
});

test("computeTrendingScore: coerces non-finite to 0", () => {
  assert.equal(computeTrendingScore(NaN, 0, 0), 0);
  assert.equal(computeTrendingScore(undefined, undefined, undefined), 0);
});

// ---------------------------------------------------------------------------
// stripPostText: collapses whitespace + truncates
// ---------------------------------------------------------------------------

test("stripPostText: collapses whitespace + trims + truncates to 500", () => {
  assert.equal(stripPostText("  hello   world  "), "hello world");
  const long = "x".repeat(600);
  assert.equal(stripPostText(long).length, 500);
  assert.equal(stripPostText(null), "");
  assert.equal(stripPostText(""), "");
});

// ---------------------------------------------------------------------------
// deriveBskyUrl
// ---------------------------------------------------------------------------

test("deriveBskyUrl: at:// uri + handle → bsky.app/profile/handle/post/rkey", () => {
  const url = deriveBskyUrl(
    "at://did:plc:abc/app.bsky.feed.post/3kxyz",
    "alice.bsky.social",
  );
  assert.equal(url, "https://bsky.app/profile/alice.bsky.social/post/3kxyz");
});

test("deriveBskyUrl: falls back to 'unknown' when handle is missing", () => {
  const url = deriveBskyUrl("at://did:plc:abc/app.bsky.feed.post/3kxyz", "");
  assert.equal(url, "https://bsky.app/profile/unknown/post/3kxyz");
});

// ---------------------------------------------------------------------------
// Embed / facet URL extraction
// ---------------------------------------------------------------------------

test("extractUrlsFromEmbed: picks up external.uri from embed.external", () => {
  const urls = extractUrlsFromEmbed({
    external: { uri: "https://github.com/foo/bar", title: "hi" },
  });
  assert.deepEqual(urls, ["https://github.com/foo/bar"]);
});

test("extractUrlsFromEmbed: picks up media.external.uri from recordWithMedia", () => {
  const urls = extractUrlsFromEmbed({
    media: { external: { uri: "https://github.com/baz/qux" } },
  });
  assert.deepEqual(urls, ["https://github.com/baz/qux"]);
});

test("extractUrlsFromEmbed: returns [] for null / non-object", () => {
  assert.deepEqual(extractUrlsFromEmbed(null), []);
  assert.deepEqual(extractUrlsFromEmbed(undefined), []);
  assert.deepEqual(extractUrlsFromEmbed("nope"), []);
});

test("extractUrlsFromFacets: collects every richtext#link feature uri", () => {
  const urls = extractUrlsFromFacets([
    {
      features: [
        {
          $type: "app.bsky.richtext.facet#link",
          uri: "https://github.com/a/b",
        },
      ],
    },
    {
      features: [
        { $type: "app.bsky.richtext.facet#mention", did: "did:plc:x" },
        {
          $type: "app.bsky.richtext.facet#link",
          uri: "https://github.com/c/d",
        },
      ],
    },
  ]);
  assert.deepEqual(urls, ["https://github.com/a/b", "https://github.com/c/d"]);
});

test("collectPostUrls: merges embed + facet URLs from a post", () => {
  const urls = collectPostUrls({
    embed: { external: { uri: "https://github.com/a/b" } },
    record: {
      facets: [
        {
          features: [
            {
              $type: "app.bsky.richtext.facet#link",
              uri: "https://github.com/c/d",
            },
          ],
        },
      ],
    },
  });
  assert.ok(urls.includes("https://github.com/a/b"));
  assert.ok(urls.includes("https://github.com/c/d"));
});

// ---------------------------------------------------------------------------
// normalizePost: end-to-end normalize w/ realistic AT Proto postView shape
// ---------------------------------------------------------------------------

test("normalizePost: extracts linkedRepos from text + embed + facets", () => {
  const raw = {
    uri: "at://did:plc:abc/app.bsky.feed.post/3kxyz",
    cid: "bafyre...",
    author: { did: "did:plc:abc", handle: "alice.bsky.social", displayName: "Alice" },
    record: {
      text: "check out github.com/anthropics/claude-code",
      createdAt: "2026-04-20T12:00:00.000Z",
    },
    embed: null,
    likeCount: 12,
    repostCount: 3,
    replyCount: 5,
    indexedAt: "2026-04-20T12:00:01.000Z",
  };
  const tracked = new Map([
    ["anthropics/claude-code", "anthropics/claude-code"],
  ]);
  const nowSec = Math.floor(Date.parse("2026-04-21T12:00:00.000Z") / 1000);
  const out = normalizePost(raw, tracked, nowSec);
  assert.ok(out, "expected a normalized post");
  assert.equal(out.uri, raw.uri);
  assert.equal(out.cid, raw.cid);
  assert.equal(out.author.handle, "alice.bsky.social");
  assert.equal(out.bskyUrl, "https://bsky.app/profile/alice.bsky.social/post/3kxyz");
  assert.equal(out.linkedRepos.length, 1);
  assert.equal(out.linkedRepos[0].fullName, "anthropics/claude-code");
  assert.equal(out.likeCount, 12);
  assert.equal(out.trendingScore, computeTrendingScore(12, 3, 5));
  // Age should be ~24h for the crafted timestamps.
  assert.ok(out.ageHours >= 23 && out.ageHours <= 25);
});

test("normalizePost: returns null for missing uri / cid / createdAt", () => {
  assert.equal(normalizePost(null, new Map(), 0), null);
  assert.equal(normalizePost({ uri: "" }, new Map(), 0), null);
  assert.equal(
    normalizePost(
      { uri: "at://x/y/z", cid: "c", record: {} },
      new Map(),
      0,
    ),
    null,
    "missing createdAt should be null",
  );
});

test("normalizePost: handles missing engagement counts as 0", () => {
  const raw = {
    uri: "at://did:plc:x/app.bsky.feed.post/3a",
    cid: "c",
    author: { handle: "b.bsky.social" },
    record: {
      text: "no numbers here",
      createdAt: "2026-04-20T12:00:00.000Z",
    },
  };
  const out = normalizePost(raw, new Map(), Math.floor(Date.now() / 1000));
  assert.ok(out);
  assert.equal(out.likeCount, 0);
  assert.equal(out.repostCount, 0);
  assert.equal(out.replyCount, 0);
  assert.equal(out.trendingScore, 0);
});
