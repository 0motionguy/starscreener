import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mapToolboxSignalToWebPost,
  ToolboxTwitterProvider,
} from "../_toolbox-twitter-provider";

const baseSignal = {
  type: "social.x.post",
  subject: {
    kind: "x_post",
    id: "1234567890",
    url: "https://x.com/jane/status/1234567890",
  },
  value: {
    text: "check out github.com/anthropics/claude-code",
    author_handle: "jane",
    posted_at: "2026-07-09T12:00:00.000Z",
  },
};

function providerWith(fetchImpl: typeof fetch): ToolboxTwitterProvider {
  return new ToolboxTwitterProvider({
    baseUrl: "https://api.aiso.tools",
    apiKey: "tbk-test-word-only-key",
    fetchImpl,
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("mapToolboxSignalToWebPost: maps a social.x.post signal", () => {
  const post = mapToolboxSignalToWebPost(baseSignal, "claude-code");
  assert.ok(post, "post should map");
  assert.equal(post.id, "1234567890");
  assert.equal(post.url, "https://x.com/jane/status/1234567890");
  assert.equal(post.authorHandle, "jane");
  assert.equal(post.content, "check out github.com/anthropics/claude-code");
  assert.equal(post.postedAt, "2026-07-09T12:00:00.000Z");
  assert.equal(post.matchedQuery, "claude-code");
  // nitter RSS source carries no engagement — zeros by contract
  assert.equal(post.likeCount, 0);
  assert.equal(post.repostCount, 0);
  assert.equal(post.viewCount, null);
  assert.equal(
    post.expandedUrls,
    undefined,
    "no t.co resolution on this source — expandedUrls stays undefined",
  );
});

test("mapToolboxSignalToWebPost: rejects non-post signal types and rows without id/url", () => {
  assert.equal(
    mapToolboxSignalToWebPost({ ...baseSignal, type: "social.x.profile" }, "q"),
    null,
  );
  assert.equal(
    mapToolboxSignalToWebPost(
      { ...baseSignal, subject: { ...baseSignal.subject, id: "  " } },
      "q",
    ),
    null,
  );
  assert.equal(
    mapToolboxSignalToWebPost(
      { ...baseSignal, subject: { kind: "x_post", id: "1", url: "" } },
      "q",
    ),
    null,
  );
});

test("search: POSTs the skill-run body and parses the signals envelope", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const provider = providerWith(async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return jsonResponse({ signals: [baseSignal] });
  });

  const posts = await provider.search({ query: '"anthropics/claude-code"' });
  assert.equal(
    capturedUrl,
    "https://api.aiso.tools/v1/skills/twitter.nitter_search/run",
  );
  const headers = capturedInit?.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer tbk-test-word-only-key");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    input: { query: '"anthropics/claude-code"', limit: 25 },
  });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].id, "1234567890");
  assert.deepEqual(provider.getStats(), {
    requests: 1,
    errors: 0,
    lastError: null,
  });
});

test("search: tolerates a bare signals array (older engine builds)", async () => {
  const provider = providerWith(async () => jsonResponse([baseSignal]));
  const posts = await provider.search({ query: "q" });
  assert.equal(posts.length, 1);
});

test("search: clamps limit to the skill's 1..50 input schema", async () => {
  let capturedBody: { input: { limit: number } } | null = null;
  const provider = providerWith(async (_url, init) => {
    capturedBody = JSON.parse(String(init?.body));
    return jsonResponse({ signals: [] });
  });
  await provider.search({ query: "q", limit: 500 });
  assert.equal(capturedBody!.input.limit, 50);
  await provider.search({ query: "q", limit: 0 });
  assert.equal(capturedBody!.input.limit, 1);
});

test("search: sinceISO drops older AND undated posts (epoch-0 sentinel)", async () => {
  // A null posted_at maps to the epoch-0 sentinel, so the freshness filter
  // drops it too — an undated post can't prove it's inside the window, and
  // this collector's whole contract is windowed freshness. Without sinceISO
  // the same post passes through.
  const oldSignal = {
    ...baseSignal,
    subject: { ...baseSignal.subject, id: "111", url: "https://x.com/a/status/111" },
    value: { ...baseSignal.value, posted_at: "2026-07-01T00:00:00.000Z" },
  };
  const undatedSignal = {
    ...baseSignal,
    subject: { ...baseSignal.subject, id: "222", url: "https://x.com/a/status/222" },
    value: { ...baseSignal.value, posted_at: null },
  };
  const provider = providerWith(async () =>
    jsonResponse({ signals: [baseSignal, oldSignal, undatedSignal] }),
  );
  const windowed = await provider.search({
    query: "q",
    sinceISO: "2026-07-08T00:00:00.000Z",
  });
  assert.deepEqual(
    windowed.map((p) => p.id),
    ["1234567890"],
  );
  const unwindowed = await provider.search({ query: "q" });
  assert.deepEqual(
    unwindowed.map((p) => p.id).sort(),
    ["111", "1234567890", "222"],
  );
});

test("search: non-2xx surfaces a descriptive error and counts in stats", async () => {
  const provider = providerWith(
    async () => new Response("unauthorized", { status: 401 }),
  );
  await assert.rejects(
    () => provider.search({ query: "q" }),
    /twitter\.nitter_search HTTP 401/,
  );
  const stats = provider.getStats();
  assert.equal(stats.errors, 1);
  assert.match(stats.lastError ?? "", /HTTP 401/);
});

test("constructor: throws descriptive errors when env creds are missing/empty", () => {
  // GH Actions `${{ vars.X }}` substitutes "" for unset vars — empty string
  // must behave exactly like missing.
  assert.throws(
    () => new ToolboxTwitterProvider({ baseUrl: "  ", apiKey: "k" }),
    /TOOLBOX_API_URL unset/,
  );
  assert.throws(
    () => new ToolboxTwitterProvider({ baseUrl: "https://api.aiso.tools", apiKey: "" }),
    /TOOLBOX_API_KEY unset/,
  );
});

test("constructor: strips trailing slashes from the base URL", async () => {
  let capturedUrl = "";
  const provider = new ToolboxTwitterProvider({
    baseUrl: "https://api.aiso.tools///",
    apiKey: "k",
    fetchImpl: async (url) => {
      capturedUrl = String(url);
      return jsonResponse({ signals: [] });
    },
  });
  await provider.search({ query: "q" });
  assert.equal(
    capturedUrl,
    "https://api.aiso.tools/v1/skills/twitter.nitter_search/run",
  );
});
