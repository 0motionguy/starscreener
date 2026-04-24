import { test } from "node:test";
import assert from "node:assert/strict";

import { DevtoAdapter } from "../adapters/devto-adapter";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

interface FakeArticle {
  id: number;
  title: string;
  description?: string;
  body_markdown?: string;
  url: string;
  canonical_url?: string;
  tag_list?: string[];
  published_at: string;
  public_reactions_count?: number;
  positive_reactions_count?: number;
  comments_count?: number;
  user: { username: string; name?: string };
}

function makeArticle(overrides: Partial<FakeArticle> = {}): FakeArticle {
  return {
    id: overrides.id ?? 1_000_001,
    title: overrides.title ?? "How I built a production-grade GitHub bot",
    description: overrides.description ?? "A short walkthrough",
    body_markdown:
      overrides.body_markdown ??
      "Check out https://github.com/vercel/next.js for details.",
    url: overrides.url ?? "https://dev.to/example/post-1",
    canonical_url:
      overrides.canonical_url ?? "https://dev.to/example/post-1",
    tag_list: overrides.tag_list ?? ["javascript", "nextjs"],
    published_at: overrides.published_at ?? "2026-04-20T12:00:00.000Z",
    public_reactions_count: overrides.public_reactions_count ?? 42,
    positive_reactions_count: overrides.positive_reactions_count ?? 42,
    comments_count: overrides.comments_count ?? 7,
    user: overrides.user ?? { username: "tester", name: "Test User" },
  };
}

function makeResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("DevtoAdapter: handles empty API response", async () => {
  const adapter = new DevtoAdapter(async () => makeResponse([]));
  const out = await adapter.fetchMentionsForRepo("vercel/next.js");
  assert.deepEqual(out, []);
});

test("DevtoAdapter: parses a known good fixture with URL match", async () => {
  const article = makeArticle({
    id: 2025_00_01,
    title: "Exploring vercel/next.js internals",
    body_markdown:
      "See https://github.com/vercel/next.js/blob/main/README.md for docs.",
    url: "https://dev.to/author/exploring-next-js",
    public_reactions_count: 120,
    comments_count: 14,
    published_at: "2026-04-20T08:30:00.000Z",
    user: { username: "author42" },
  });
  const adapter = new DevtoAdapter(async () => makeResponse([article]));
  const out = await adapter.fetchMentionsForRepo("vercel/next.js");
  assert.equal(out.length, 1);
  const m = out[0];
  assert.equal(m.platform, "devto");
  assert.equal(m.author, "@author42");
  assert.equal(m.url, "https://dev.to/author/exploring-next-js");
  assert.equal(m.engagement, 120 + 14);
  assert.equal(m.reach, (120 + 14) * 10);
  assert.equal(m.isInfluencer, true);
  assert.equal(m.id, "devto-20250001");
  assert.equal(m.repoId, "vercel--next-js");
  assert.ok(m.postedAt.startsWith("2026-04-20"));
  assert.ok(typeof m.content === "string" && m.content.length > 0);
});

test("DevtoAdapter: filters out articles that do not reference the repo", async () => {
  const unrelated = makeArticle({
    id: 42,
    title: "Unrelated post about cats",
    description: "nothing to do with the repo",
    body_markdown: "random content",
    tag_list: ["cats"],
    url: "https://dev.to/cats/post",
  });
  const adapter = new DevtoAdapter(async () => makeResponse([unrelated]));
  const out = await adapter.fetchMentionsForRepo("vercel/next.js");
  assert.deepEqual(out, []);
});

test("DevtoAdapter: picks up title-match as low-confidence mention", async () => {
  const art = makeArticle({
    id: 77,
    title: "Why I love vercel/next.js",
    description: "thoughts",
    body_markdown: "No github link in body",
    tag_list: ["frontend"],
    url: "https://dev.to/fan/love-next",
  });
  const adapter = new DevtoAdapter(async () => makeResponse([art]));
  const out = await adapter.fetchMentionsForRepo("vercel/next.js");
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "devto-77");
});

test("DevtoAdapter: returns [] when fetch throws", async () => {
  const adapter = new DevtoAdapter(async () => {
    throw new Error("network down");
  });
  const out = await adapter.fetchMentionsForRepo("vercel/next.js");
  assert.deepEqual(out, []);
});

test("DevtoAdapter: returns [] on non-ok HTTP status", async () => {
  const adapter = new DevtoAdapter(async () =>
    makeResponse({ error: "boom" }, { status: 500 }),
  );
  const out = await adapter.fetchMentionsForRepo("vercel/next.js");
  assert.deepEqual(out, []);
});

test("DevtoAdapter: emits non-empty, well-formed URL", async () => {
  const article = makeArticle({
    id: 999,
    url: "https://dev.to/foo/bar",
    body_markdown: "https://github.com/ollama/ollama",
  });
  const adapter = new DevtoAdapter(async () => makeResponse([article]));
  const out = await adapter.fetchMentionsForRepo("ollama/ollama");
  assert.equal(out.length, 1);
  assert.ok(
    out[0].url.startsWith("https://dev.to/") && out[0].url.length > 15,
    `expected a dev.to URL, got "${out[0].url}"`,
  );
});

test("DevtoAdapter: respects `since` timestamp", async () => {
  const old = makeArticle({
    id: 1,
    published_at: "2020-01-01T00:00:00.000Z",
    body_markdown: "https://github.com/vercel/next.js",
  });
  const fresh = makeArticle({
    id: 2,
    published_at: "2026-04-20T00:00:00.000Z",
    body_markdown: "https://github.com/vercel/next.js",
  });
  const adapter = new DevtoAdapter(async () => makeResponse([old, fresh]));
  const out = await adapter.fetchMentionsForRepo(
    "vercel/next.js",
    "2025-01-01T00:00:00.000Z",
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "devto-2");
});

test("DevtoAdapter: tolerates malformed article entries", async () => {
  const good = makeArticle({
    id: 11,
    body_markdown: "https://github.com/vercel/next.js",
  });
  const malformed: unknown = { not: "an article" };
  const adapter = new DevtoAdapter(async () =>
    makeResponse([good, malformed]),
  );
  const out = await adapter.fetchMentionsForRepo("vercel/next.js");
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "devto-11");
});
