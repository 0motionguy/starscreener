import assert from "node:assert/strict";
import { test } from "node:test";

import { mapApifyTweetToWebPost } from "../_apify-twitter-provider";

const baseTweet = {
  id: "1234567890",
  url: "https://x.com/jane/status/1234567890",
  text: "check this out https://t.co/abc123",
  createdAt: "2026-04-30T12:00:00Z",
  likeCount: 5,
  retweetCount: 2,
  replyCount: 1,
  quoteCount: 0,
  viewCount: 100,
  author: { userName: "jane", name: "Jane" },
};

test("mapApifyTweetToWebPost: extracts github URL behind t.co via entities.urls.expanded_url", () => {
  const raw = {
    ...baseTweet,
    entities: {
      urls: [
        {
          url: "https://t.co/abc123",
          expanded_url: "https://github.com/anthropics/claude-code",
          display_url: "github.com/anthropics/claude-code",
        },
      ],
    },
  };
  const post = mapApifyTweetToWebPost(raw, "claude-code");
  assert.ok(post, "post should map");
  assert.deepEqual(post.expandedUrls, [
    "https://github.com/anthropics/claude-code",
  ]);
});

test("mapApifyTweetToWebPost: tolerates absent entities (omits expandedUrls)", () => {
  const post = mapApifyTweetToWebPost(baseTweet, "claude-code");
  assert.ok(post);
  assert.equal(
    post.expandedUrls,
    undefined,
    "absent entities should leave expandedUrls undefined, not an empty array",
  );
});

test("mapApifyTweetToWebPost: dedupes expanded URLs across entities + legacy.entities", () => {
  const raw = {
    ...baseTweet,
    entities: {
      urls: [{ expanded_url: "https://github.com/foo/bar" }],
    },
    legacy: {
      entities: {
        urls: [
          { expanded_url: "https://github.com/foo/bar" },
          { expanded_url: "https://github.com/baz/qux" },
        ],
      },
    },
  };
  const post = mapApifyTweetToWebPost(raw, "q");
  assert.deepEqual(post?.expandedUrls, [
    "https://github.com/foo/bar",
    "https://github.com/baz/qux",
  ]);
});

test("mapApifyTweetToWebPost: falls back to expandedUrl + unwound_url field names", () => {
  const raw = {
    ...baseTweet,
    entities: {
      urls: [
        { expandedUrl: "https://github.com/cam/case" },
        { unwound_url: "https://github.com/un/wound" },
        { url: "https://t.co/no-expand" },
      ],
    },
  };
  const post = mapApifyTweetToWebPost(raw, "q");
  assert.deepEqual(post?.expandedUrls, [
    "https://github.com/cam/case",
    "https://github.com/un/wound",
  ]);
});

test("mapApifyTweetToWebPost: ignores malformed entry shapes (non-string/null/missing)", () => {
  const raw = {
    ...baseTweet,
    entities: {
      urls: [
        null,
        "not-an-object",
        { expanded_url: 123 },
        { expanded_url: "" },
        { expanded_url: "https://github.com/valid/one" },
      ],
    },
  };
  const post = mapApifyTweetToWebPost(raw, "q");
  assert.deepEqual(post?.expandedUrls, ["https://github.com/valid/one"]);
});
