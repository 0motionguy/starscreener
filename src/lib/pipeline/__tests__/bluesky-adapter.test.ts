import { test } from "node:test";
import assert from "node:assert/strict";

import { BlueskyAdapter } from "../adapters/bluesky-adapter";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

interface FakePost {
  uri: string;
  cid?: string;
  author: { handle: string; displayName?: string; did?: string };
  record: { text: string; createdAt: string };
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  quoteCount?: number;
  indexedAt?: string;
}

function makePost(overrides: Partial<FakePost> = {}): FakePost {
  return {
    uri:
      overrides.uri ??
      "at://did:plc:abc123/app.bsky.feed.post/3ktest001",
    cid: overrides.cid ?? "bafyfakecid",
    author: overrides.author ?? {
      handle: "alice.bsky.social",
      displayName: "Alice",
      did: "did:plc:abc123",
    },
    record: overrides.record ?? {
      text: "Shipping vercel/next.js 15 in production — super smooth so far!",
      createdAt: "2026-04-22T10:00:00.000Z",
    },
    likeCount: overrides.likeCount ?? 12,
    repostCount: overrides.repostCount ?? 3,
    replyCount: overrides.replyCount ?? 2,
    quoteCount: overrides.quoteCount ?? 1,
    indexedAt: overrides.indexedAt ?? "2026-04-22T10:01:00.000Z",
  };
}

function makeResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("BlueskyAdapter: handles empty API response", async () => {
  const adapter = new BlueskyAdapter(async () =>
    makeResponse({ posts: [] }),
  );
  const out = await adapter.fetchMentionsForRepo("vercel/next.js");
  assert.deepEqual(out, []);
});

test("BlueskyAdapter: parses a known good fixture", async () => {
  const post = makePost();
  const adapter = new BlueskyAdapter(async () =>
    makeResponse({ posts: [post] }),
  );
  const out = await adapter.fetchMentionsForRepo("vercel/next.js");
  assert.equal(out.length, 1);
  const m = out[0];
  assert.equal(m.platform, "bluesky");
  assert.equal(m.author, "@alice.bsky.social");
  // likeCount=12 + repost*2 (3*2=6) + reply=2 + quote=1 = 21
  assert.equal(m.engagement, 12 + 3 * 2 + 2 + 1);
  assert.equal(m.reach, (12 + 3 * 2 + 2 + 1) * 30);
  assert.equal(m.isInfluencer, false);
  assert.equal(m.repoId, "vercel--next-js");
  assert.ok(m.postedAt.startsWith("2026-04-22"));
  assert.ok(m.content.includes("vercel/next.js"));
  assert.ok(
    m.url.startsWith("https://bsky.app/profile/"),
    `expected bsky.app URL, got ${m.url}`,
  );
  assert.ok(m.url.includes("3ktest001"), "URL should include the rkey");
});

test("BlueskyAdapter: filters out posts that do not mention the repo", async () => {
  const unrelated = makePost({
    record: {
      text: "just thinking about cats today",
      createdAt: "2026-04-22T10:00:00.000Z",
    },
  });
  const adapter = new BlueskyAdapter(async () =>
    makeResponse({ posts: [unrelated] }),
  );
  const out = await adapter.fetchMentionsForRepo("vercel/next.js");
  assert.deepEqual(out, []);
});

test("BlueskyAdapter: flags high-engagement posts as influencer", async () => {
  const post = makePost({
    likeCount: 80,
    repostCount: 20,
    replyCount: 5,
    quoteCount: 0,
    record: {
      text: "vercel/next.js just dropped a killer update",
      createdAt: "2026-04-22T10:00:00.000Z",
    },
  });
  const adapter = new BlueskyAdapter(async () =>
    makeResponse({ posts: [post] }),
  );
  const out = await adapter.fetchMentionsForRepo("vercel/next.js");
  assert.equal(out.length, 1);
  // 80 + 20*2 + 5 + 0 = 125, above threshold=100
  assert.equal(out[0].isInfluencer, true);
});

test("BlueskyAdapter: returns [] when fetch throws", async () => {
  const adapter = new BlueskyAdapter(async () => {
    throw new Error("network down");
  });
  const out = await adapter.fetchMentionsForRepo("vercel/next.js");
  assert.deepEqual(out, []);
});

test("BlueskyAdapter: returns [] on non-ok HTTP status", async () => {
  const adapter = new BlueskyAdapter(async () =>
    makeResponse({ error: "RateLimitExceeded" }, { status: 429 }),
  );
  const out = await adapter.fetchMentionsForRepo("vercel/next.js");
  assert.deepEqual(out, []);
});

test("BlueskyAdapter: respects `since` timestamp", async () => {
  const oldPost = makePost({
    uri: "at://did:plc:abc/app.bsky.feed.post/3ktold",
    record: {
      text: "vercel/next.js early look",
      createdAt: "2020-01-01T00:00:00.000Z",
    },
  });
  const freshPost = makePost({
    uri: "at://did:plc:abc/app.bsky.feed.post/3ktnew",
    record: {
      text: "vercel/next.js is still my favorite",
      createdAt: "2026-04-22T00:00:00.000Z",
    },
  });
  const adapter = new BlueskyAdapter(async () =>
    makeResponse({ posts: [oldPost, freshPost] }),
  );
  const out = await adapter.fetchMentionsForRepo(
    "vercel/next.js",
    "2025-01-01T00:00:00.000Z",
  );
  assert.equal(out.length, 1);
  assert.ok(out[0].id.endsWith("3ktnew"));
});

test("BlueskyAdapter: emits non-empty, well-formed URL", async () => {
  const post = makePost({
    uri: "at://did:plc:xyz/app.bsky.feed.post/abc999",
    author: { handle: "bob.dev", did: "did:plc:xyz" },
    record: {
      text: "check out vercel/next.js",
      createdAt: "2026-04-22T09:00:00.000Z",
    },
  });
  const adapter = new BlueskyAdapter(async () =>
    makeResponse({ posts: [post] }),
  );
  const out = await adapter.fetchMentionsForRepo("vercel/next.js");
  assert.equal(out.length, 1);
  assert.ok(
    out[0].url.startsWith("https://bsky.app/profile/bob.dev/post/"),
    `expected profile-scoped URL, got "${out[0].url}"`,
  );
});

test("BlueskyAdapter: tolerates missing fields", async () => {
  const malformed = { uri: "at://x/y", record: {}, author: {} };
  const good = makePost();
  const adapter = new BlueskyAdapter(async () =>
    makeResponse({ posts: [malformed, good] }),
  );
  const out = await adapter.fetchMentionsForRepo("vercel/next.js");
  assert.equal(out.length, 1);
});

test("BlueskyAdapter: short-circuits on malformed fullName", async () => {
  // No '/' means no owner/name split possible — we bail before fetch.
  let called = false;
  const adapter = new BlueskyAdapter(async () => {
    called = true;
    return makeResponse({ posts: [] });
  });
  const out = await adapter.fetchMentionsForRepo("not-a-valid-repo");
  assert.deepEqual(out, []);
  assert.equal(called, false);
});
