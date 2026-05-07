// Unit tests for the 8 cross-source channel adapters in
// scripts/_cross-source-search.mjs. Each adapter:
//   - takes a RepoInput (and optionally session/snapshot/apiKey/queryStrings)
//   - returns Mention[] (never throws — fail-soft)
//
// All adapters except the snapshot-based ones (Lobsters, ProductHunt) reach
// the network through globalThis.fetch, so we stub fetch per-test and restore
// it in `t.after`. searchAlgoliaStories (used by searchHackerNews) also goes
// through the same global fetch; mocking it is sufficient.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  searchHackerNews,
  searchReddit,
  searchBluesky,
  searchDevto,
  searchLobsters,
  searchProductHunt,
  searchTavily,
  searchTwitter,
} from "../_cross-source-search.mjs";

// ---------------------------------------------------------------------------
// Shared fixtures + helpers
// ---------------------------------------------------------------------------

function makeRepo(overrides = {}) {
  return {
    fullName: "vercel/next.js",
    owner: "vercel",
    name: "next.js",
    packageNames: [],
    aliases: [],
    homepageUrl: null,
    description: null,
    rank: 1,
    source: "trending",
    ...overrides,
  };
}

// Distinctive name (>=5 chars + not in HN_GENERIC_NAMES). Repos with non-
// distinctive names skip the third query in HN/Reddit, which is fine for
// the happy-path assertions but matters when we count fetch invocations.
function makeDistinctiveRepo(overrides = {}) {
  return makeRepo({
    fullName: "anthropics/claude-code",
    owner: "anthropics",
    name: "claude-code",
    ...overrides,
  });
}

// Build a minimal Response-like object honoring the methods _cross-source-
// search.mjs / _hn-shared.mjs touch: ok, status, statusText, headers.get,
// json().
function jsonResponse(body, init = {}) {
  return {
    ok: init.status ? init.status >= 200 && init.status < 300 : true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    headers: { get: () => null },
    async json() {
      return body;
    },
  };
}

function errorResponse(status = 500) {
  return {
    ok: false,
    status,
    statusText: "Internal Server Error",
    headers: { get: () => null },
    async json() {
      return {};
    },
  };
}

// Replace globalThis.fetch for the duration of a test, restore afterwards.
// `impl` receives (url, opts) — same signature as the platform fetch.
function stubFetch(t, impl) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return impl(String(url), opts);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

function abortError() {
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  return err;
}

function assertMentionShape(m, expectedSource) {
  assert.equal(m.source, expectedSource, "source");
  assert.equal(typeof m.fullName, "string", "fullName is string");
  assert.equal(typeof m.url, "string", "url is string");
  assert.equal(typeof m.title, "string", "title is string");
  assert.equal(typeof m.text, "string", "text is string");
  // author is string|null per the contract.
  assert.ok(
    m.author === null || typeof m.author === "string",
    "author is string|null",
  );
  assert.equal(typeof m.engagement, "object", "engagement is object");
  assert.ok(m.engagement !== null, "engagement is not null");
  assert.equal(typeof m.observedAt, "string", "observedAt is string");
  // observedAt should at least look like an ISO date or known fallback.
  assert.ok(m.observedAt.length > 0, "observedAt non-empty");
}

// ---------------------------------------------------------------------------
// searchHackerNews
// ---------------------------------------------------------------------------

test("searchHackerNews: happy path returns Mention[] with HN shape", async (t) => {
  const repo = makeDistinctiveRepo();
  // searchAlgoliaStories paginates by reading body.nbPages — we return 1
  // page and a single hit so the caller doesn't loop further. Three queries
  // are issued (URL/slug/distinctive-name); the same hit dedupes via
  // objectID so the adapter still returns exactly one mention.
  const hit = {
    objectID: "42",
    title: "Show HN: claude-code",
    url: "https://github.com/anthropics/claude-code",
    story_text: "I made an agent.",
    author: "alice",
    points: 250,
    num_comments: 33,
    created_at_i: 1_700_000_000,
  };
  stubFetch(t, () =>
    jsonResponse({
      hits: [hit],
      nbPages: 1,
    }),
  );

  const result = await searchHackerNews(repo);
  assert.ok(Array.isArray(result), "returns an array");
  assert.equal(result.length, 1, "deduped to one mention");
  const m = result[0];
  assertMentionShape(m, "hackernews");
  assert.equal(m.fullName, "anthropics/claude-code");
  assert.equal(m.url, "https://github.com/anthropics/claude-code");
  assert.equal(m.title, "Show HN: claude-code");
  assert.equal(m.author, "alice");
  assert.equal(m.engagement.score, 250);
  assert.equal(m.engagement.comments, 33);
});

test("searchHackerNews: empty hits returns []", async (t) => {
  stubFetch(t, () => jsonResponse({ hits: [], nbPages: 1 }));
  const result = await searchHackerNews(makeRepo());
  assert.deepEqual(result, []);
});

test("searchHackerNews: HTTP 500 returns [] (fail-soft)", async (t) => {
  // _hn-shared retries 5xx 3x with backoff; we always return 500. The
  // adapter catches the final throw and returns []. retryDelay scales as
  // 500*attempt so total delay is ~1.5s — within the test runner budget.
  stubFetch(t, () => errorResponse(500));
  const result = await searchHackerNews(makeRepo());
  assert.deepEqual(result, []);
});

test("searchHackerNews: AbortError returns []", async (t) => {
  // Throw on every fetch — _hn-shared retries 3x then re-throws. Adapter
  // catches and returns [].
  stubFetch(t, () => {
    throw abortError();
  });
  const result = await searchHackerNews(makeRepo());
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// searchReddit
// ---------------------------------------------------------------------------

test("searchReddit: happy path returns Mention[] with reddit shape", async (t) => {
  const repo = makeDistinctiveRepo();
  const post = {
    id: "abc123",
    title: "claude-code is great",
    selftext: "Long body of the post.",
    permalink: "/r/programming/comments/abc123/claude_code/",
    url: "https://github.com/anthropics/claude-code",
    author: "redditor",
    score: 99,
    num_comments: 12,
    created_utc: 1_700_000_000,
  };
  stubFetch(t, () =>
    jsonResponse({
      data: { children: [{ data: post }] },
    }),
  );

  const result = await searchReddit(repo);
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1, "dedup by id across queries");
  const m = result[0];
  assertMentionShape(m, "reddit");
  assert.equal(m.fullName, "anthropics/claude-code");
  assert.equal(
    m.url,
    "https://www.reddit.com/r/programming/comments/abc123/claude_code/",
  );
  assert.equal(m.title, "claude-code is great");
  assert.equal(m.text, "Long body of the post.");
  assert.equal(m.author, "redditor");
  assert.equal(m.engagement.score, 99);
  assert.equal(m.engagement.comments, 12);
});

test("searchReddit: empty children returns []", async (t) => {
  stubFetch(t, () => jsonResponse({ data: { children: [] } }));
  const result = await searchReddit(makeRepo());
  assert.deepEqual(result, []);
});

test("searchReddit: HTTP 500 returns [] (per-query catch)", async (t) => {
  stubFetch(t, () => errorResponse(500));
  const result = await searchReddit(makeRepo());
  assert.deepEqual(result, []);
});

test("searchReddit: AbortError returns []", async (t) => {
  stubFetch(t, () => {
    throw abortError();
  });
  const result = await searchReddit(makeRepo());
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// searchBluesky
// ---------------------------------------------------------------------------

test("searchBluesky: null session returns [] without calling fetch", async (t) => {
  const calls = stubFetch(t, () => {
    throw new Error("fetch should not be called");
  });
  const result = await searchBluesky(makeRepo(), null);
  assert.deepEqual(result, []);
  assert.equal(calls.length, 0, "fetch not invoked");
});

test("searchBluesky: missing accessJwt returns [] without fetch", async (t) => {
  const calls = stubFetch(t, () => {
    throw new Error("fetch should not be called");
  });
  const result = await searchBluesky(makeRepo(), {});
  assert.deepEqual(result, []);
  assert.equal(calls.length, 0);
});

test("searchBluesky: happy path returns Mention[] with bluesky shape", async (t) => {
  const repo = makeRepo();
  const post = {
    uri: "at://did:plc:abc/app.bsky.feed.post/3kxyz",
    cid: "bafyre",
    author: { did: "did:plc:abc", handle: "alice.bsky.social" },
    record: {
      text: "love github.com/vercel/next.js",
      createdAt: "2026-04-20T12:00:00.000Z",
    },
    likeCount: 7,
    repostCount: 3,
    replyCount: 2,
    indexedAt: "2026-04-20T12:00:01.000Z",
  };
  stubFetch(t, () => jsonResponse({ posts: [post] }));

  const result = await searchBluesky(repo, { accessJwt: "JWT" });
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1);
  const m = result[0];
  assertMentionShape(m, "bluesky");
  assert.equal(m.fullName, "vercel/next.js");
  assert.equal(
    m.url,
    "https://bsky.app/profile/alice.bsky.social/post/3kxyz",
  );
  assert.equal(m.author, "alice.bsky.social");
  assert.equal(m.engagement.score, 10); // 7 likes + 3 reposts
  assert.equal(m.engagement.comments, 2);
  assert.equal(m.observedAt, "2026-04-20T12:00:01.000Z");
});

test("searchBluesky: empty posts array returns []", async (t) => {
  stubFetch(t, () => jsonResponse({ posts: [] }));
  const result = await searchBluesky(makeRepo(), { accessJwt: "JWT" });
  assert.deepEqual(result, []);
});

test("searchBluesky: HTTP 500 returns [] (fail-soft)", async (t) => {
  stubFetch(t, () => errorResponse(500));
  const result = await searchBluesky(makeRepo(), { accessJwt: "JWT" });
  assert.deepEqual(result, []);
});

test("searchBluesky: AbortError returns []", async (t) => {
  stubFetch(t, () => {
    throw abortError();
  });
  const result = await searchBluesky(makeRepo(), { accessJwt: "JWT" });
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// searchDevto
// ---------------------------------------------------------------------------

test("searchDevto: happy path returns Mention[] with devto shape", async (t) => {
  const repo = makeRepo();
  const article = {
    title: "Why I love Next.js",
    description: "A short blurb about it.",
    url: "https://dev.to/foo/post-1",
    path: "/foo/post-1",
    user: { username: "foo" },
    public_reactions_count: 50,
    comments_count: 5,
    published_at: "2026-04-20T12:00:00.000Z",
  };
  stubFetch(t, () => jsonResponse({ result: [article] }));

  const result = await searchDevto(repo);
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1);
  const m = result[0];
  assertMentionShape(m, "devto");
  assert.equal(m.url, "https://dev.to/foo/post-1");
  assert.equal(m.author, "foo");
  assert.equal(m.engagement.score, 50);
  assert.equal(m.engagement.comments, 5);
});

test("searchDevto: empty result returns []", async (t) => {
  stubFetch(t, () => jsonResponse({ result: [] }));
  const result = await searchDevto(makeRepo());
  assert.deepEqual(result, []);
});

test("searchDevto: HTTP 500 returns [] (fail-soft)", async (t) => {
  stubFetch(t, () => errorResponse(500));
  const result = await searchDevto(makeRepo());
  assert.deepEqual(result, []);
});

test("searchDevto: AbortError returns []", async (t) => {
  stubFetch(t, () => {
    throw abortError();
  });
  const result = await searchDevto(makeRepo());
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// searchLobsters (snapshot-based; doesn't touch fetch)
// ---------------------------------------------------------------------------

test("searchLobsters: missing snapshot returns []", async () => {
  const result = await searchLobsters(makeRepo(), null);
  assert.deepEqual(result, []);
});

test("searchLobsters: empty stories returns []", async () => {
  const result = await searchLobsters(makeRepo(), { stories: [] });
  assert.deepEqual(result, []);
});

test("searchLobsters: matches by fullName, filters non-matches", async () => {
  const repo = makeRepo();
  const snapshot = {
    stories: [
      {
        title: "Cool: vercel/next.js released v15",
        url: "https://example.com/post",
        description: "all about github.com/vercel/next.js",
        submitter: "lobster1",
        score: 12,
        commentCount: 4,
        createdAt: "2026-04-20T12:00:00.000Z",
      },
      {
        // No mention of vercel/next.js anywhere — should be filtered out.
        title: "Unrelated Rust crate",
        url: "https://example.com/rust",
        description: "rust async",
        submitter: "lobster2",
        score: 1,
        commentCount: 0,
        createdAt: "2026-04-20T12:00:00.000Z",
      },
    ],
  };
  const result = await searchLobsters(repo, snapshot);
  assert.equal(result.length, 1, "non-matching story filtered");
  const m = result[0];
  assertMentionShape(m, "lobsters");
  assert.equal(m.fullName, "vercel/next.js");
  assert.equal(m.url, "https://example.com/post");
  assert.equal(m.author, "lobster1");
  assert.equal(m.engagement.score, 12);
  assert.equal(m.engagement.comments, 4);
});

// ---------------------------------------------------------------------------
// searchProductHunt (snapshot-based; doesn't touch fetch)
// ---------------------------------------------------------------------------

test("searchProductHunt: missing snapshot returns []", async () => {
  const result = await searchProductHunt(makeRepo(), null);
  assert.deepEqual(result, []);
});

test("searchProductHunt: empty launches returns []", async () => {
  const result = await searchProductHunt(makeRepo(), { launches: [] });
  assert.deepEqual(result, []);
});

test("searchProductHunt: matches by linkedRepo, filters non-matches", async () => {
  const repo = makeRepo();
  const snapshot = {
    launches: [
      {
        name: "NextJS Tools",
        tagline: "Tools for Next.js",
        url: "https://producthunt.com/posts/nextjs-tools",
        linkedRepo: "vercel/next.js",
        website: "https://example.com/nextjs-tools",
        votesCount: 200,
        commentsCount: 12,
        makers: [{ username: "ph_maker" }],
        createdAt: "2026-04-20T12:00:00.000Z",
      },
      {
        // Unrelated launch — no linkedRepo, no matching website.
        name: "Other thing",
        tagline: "Random",
        url: "https://producthunt.com/posts/other",
        linkedRepo: null,
        website: "https://other.com",
        votesCount: 1,
        commentsCount: 0,
      },
    ],
  };
  const result = await searchProductHunt(repo, snapshot);
  assert.equal(result.length, 1, "non-matching launch filtered");
  const m = result[0];
  assertMentionShape(m, "producthunt");
  assert.equal(m.title, "NextJS Tools");
  assert.equal(m.author, "ph_maker");
  assert.equal(m.engagement.score, 200);
  assert.equal(m.engagement.comments, 12);
});

// ---------------------------------------------------------------------------
// searchTavily
// ---------------------------------------------------------------------------
// Tavily uses a 24h disk cache (`.tmp/tavily-cache.json`). Tests must clear
// it between cases — otherwise the happy-path test caches a result for
// `vercel/next.js` and subsequent tests for the same repo get cache hits
// instead of exercising the empty/500/abort branches.

import { unlinkSync as _unlinkTavilyCache } from "node:fs";
import { resolve as _resolveTavilyCache } from "node:path";
const TAVILY_CACHE_PATH = _resolveTavilyCache(process.cwd(), ".tmp/tavily-cache.json");
function clearTavilyCache() {
  try { _unlinkTavilyCache(TAVILY_CACHE_PATH); } catch {}
}

test("searchTavily: missing apiKey returns [] without fetch", async (t) => {
  clearTavilyCache();
  const calls = stubFetch(t, () => {
    throw new Error("fetch should not be called");
  });
  const result = await searchTavily(makeRepo(), undefined);
  assert.deepEqual(result, []);
  assert.equal(calls.length, 0, "fetch not invoked");
});

test("searchTavily: happy path returns Mention[] with tavily shape", async (t) => {
  clearTavilyCache();
  const repo = makeRepo();
  // Mix of (a) a third-party blog post and (b) the GitHub self-link, which
  // the adapter is expected to filter out.
  const results = [
    {
      url: "https://blog.example.com/why-nextjs",
      title: "Why Next.js",
      content: "A great framework.",
      score: 0.85,
      published_date: "2026-04-20T12:00:00.000Z",
    },
    {
      url: "https://github.com/vercel/next.js",
      title: "Self-link",
      content: "self",
      score: 0.99,
    },
  ];
  stubFetch(t, () => jsonResponse({ results }));

  const out = await searchTavily(repo, "TAVILY_KEY");
  assert.equal(out.length, 1, "github self-link filtered out");
  const m = out[0];
  assertMentionShape(m, "tavily");
  assert.equal(m.url, "https://blog.example.com/why-nextjs");
  assert.equal(m.author, null);
  assert.equal(m.engagement.score, 85, "score scaled to 0..100 int");
});

test("searchTavily: empty results returns []", async (t) => {
  clearTavilyCache();
  stubFetch(t, () => jsonResponse({ results: [] }));
  const result = await searchTavily(makeRepo(), "TAVILY_KEY");
  assert.deepEqual(result, []);
});

test("searchTavily: HTTP 500 returns [] (fail-soft)", async (t) => {
  clearTavilyCache();
  stubFetch(t, () => errorResponse(500));
  const result = await searchTavily(makeRepo(), "TAVILY_KEY");
  assert.deepEqual(result, []);
});

test("searchTavily: AbortError returns []", async (t) => {
  clearTavilyCache();
  stubFetch(t, () => {
    throw abortError();
  });
  const result = await searchTavily(makeRepo(), "TAVILY_KEY");
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// searchTwitter
// ---------------------------------------------------------------------------

test("searchTwitter: missing APIFY_API_TOKEN returns [] without fetch", async (t) => {
  const calls = stubFetch(t, () => {
    throw new Error("fetch should not be called");
  });
  // Snapshot + restore env to avoid leaking into other tests.
  const prev = process.env.APIFY_API_TOKEN;
  delete process.env.APIFY_API_TOKEN;
  t.after(() => {
    if (prev === undefined) delete process.env.APIFY_API_TOKEN;
    else process.env.APIFY_API_TOKEN = prev;
  });

  const result = await searchTwitter(makeRepo(), ["query"], {});
  assert.deepEqual(result, []);
  assert.equal(calls.length, 0);
});

test("searchTwitter: empty query strings returns [] (no fetch)", async (t) => {
  const calls = stubFetch(t, () => {
    throw new Error("fetch should not be called");
  });
  const result = await searchTwitter(makeRepo(), [], { token: "TOK" });
  assert.deepEqual(result, []);
  assert.equal(calls.length, 0);
});

test("searchTwitter: actorId honors APIFY_TWITTER_ACTOR via opts", async (t) => {
  // The adapter accepts opts.actorId directly (the ENV-var path is read by
  // the caller in sweep-cross-source-mentions.ts and passed in via opts).
  // We assert that whatever is passed in opts.actorId lands in the URL.
  let capturedUrl = "";
  stubFetch(t, (url) => {
    capturedUrl = url;
    return jsonResponse([]);
  });
  const customActor = "my-org~custom-tweet-actor";
  await searchTwitter(makeRepo(), ["q1"], {
    token: "TOK",
    actorId: customActor,
  });
  // Apify URL-encodes "~" as %7E.
  assert.ok(
    capturedUrl.includes(encodeURIComponent(customActor)),
    `expected actorId ${customActor} encoded in URL, got ${capturedUrl}`,
  );
});

test("searchTwitter: default actorId is apidojo~tweet-scraper", async (t) => {
  let capturedUrl = "";
  stubFetch(t, (url) => {
    capturedUrl = url;
    return jsonResponse([]);
  });
  await searchTwitter(makeRepo(), ["q1"], { token: "TOK" });
  assert.ok(
    capturedUrl.includes(encodeURIComponent("apidojo~tweet-scraper")),
    `expected default actor in URL, got ${capturedUrl}`,
  );
});

test("searchTwitter: happy path returns Mention[] with twitter shape", async (t) => {
  const repo = makeRepo();
  const tweet = {
    id: "1234567890",
    text: "Loved using next.js this week!",
    url: "https://x.com/dev_user/status/1234567890",
    author: { userName: "dev_user" },
    likeCount: 100,
    retweetCount: 25,
    replyCount: 7,
    createdAt: "2026-04-20T12:00:00.000Z",
  };
  stubFetch(t, () => jsonResponse([tweet]));
  const result = await searchTwitter(repo, ["next.js"], { token: "TOK" });
  assert.equal(result.length, 1);
  const m = result[0];
  assertMentionShape(m, "twitter");
  assert.equal(m.author, "dev_user");
  assert.equal(m.url, "https://x.com/dev_user/status/1234567890");
  assert.equal(m.engagement.score, 125); // 100 likes + 25 retweets
  assert.equal(m.engagement.comments, 7);
});

test("searchTwitter: empty array response returns []", async (t) => {
  stubFetch(t, () => jsonResponse([]));
  const result = await searchTwitter(makeRepo(), ["q"], { token: "TOK" });
  assert.deepEqual(result, []);
});

test("searchTwitter: non-array response returns []", async (t) => {
  // Apify run-sync occasionally returns an error object instead of an
  // array — adapter must defend.
  stubFetch(t, () => jsonResponse({ error: "actor failed" }));
  const result = await searchTwitter(makeRepo(), ["q"], { token: "TOK" });
  assert.deepEqual(result, []);
});

test("searchTwitter: HTTP 500 returns [] (fail-soft)", async (t) => {
  stubFetch(t, () => errorResponse(500));
  const result = await searchTwitter(makeRepo(), ["q"], { token: "TOK" });
  assert.deepEqual(result, []);
});

test("searchTwitter: AbortError returns []", async (t) => {
  stubFetch(t, () => {
    throw abortError();
  });
  const result = await searchTwitter(makeRepo(), ["q"], { token: "TOK" });
  assert.deepEqual(result, []);
});
