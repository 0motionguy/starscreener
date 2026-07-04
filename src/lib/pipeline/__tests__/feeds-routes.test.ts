// Smoke tests for /feeds/breakouts.xml and /feeds/funding.xml route handlers.
//
// These hit the real route modules (so they also exercise the interaction
// between derived-repos + funding-news and the RSS serializer) but only
// assert shape-level invariants: 200 status, correct MIME, valid RSS shell,
// at least one <item> when data is present, cache-control set.
//
// We deliberately do NOT assert specific repo/funding content — that's
// derived from committed JSON which changes weekly. The runtime integration
// tests above in derived-repos.test.ts already pin down that behavior.

import { strict as assert } from "node:assert";
import { test } from "node:test";

// Route imports use the @/... alias resolved by tsx + tsconfig paths.
import { NextRequest } from "next/server";
import { GET as breakoutsGET } from "../../../app/feeds/breakouts.xml/route";
import { GET as fundingGET } from "../../../app/feeds/funding.xml/route";
import { GET as categoryFeedGET } from "../../../app/feeds/[slug]/route";
import { GET as feedsIndexGET } from "../../../app/feeds/route";
import { CATEGORIES } from "../../../lib/constants";

async function callCategoryFeed(slug: string): Promise<Response> {
  const req = new NextRequest(`https://trendingrepo.com/feeds/${slug}.xml`);
  const res = await categoryFeedGET(req);
  // The route's GET always resolves to a Response, but the Next.js
  // RouteHandlerConfig signature widens to `Response | void`. Coerce here so
  // the test assertions can keep treating it as a Response.
  if (!res) {
    throw new Error(`callCategoryFeed(${slug}) returned void`);
  }
  return res;
}

test("feeds/breakouts.xml — 200 + application/rss+xml + RSS 2.0 shell", async () => {
  const res = await breakoutsGET();
  assert.equal(res.status, 200);
  const ct = res.headers.get("content-type") ?? "";
  assert.match(ct, /application\/rss\+xml/);
  assert.match(
    res.headers.get("cache-control") ?? "",
    /s-maxage=1800/,
  );
  const body = await res.text();
  assert.ok(body.startsWith('<?xml version="1.0"'));
  assert.match(body, /<rss version="2\.0"/);
  assert.match(body, /<channel>/);
  assert.match(body, /<\/rss>/);
  // Feed self-link present (validators require this for RSS 2.0 best-practice).
  assert.match(body, /atom:link[^>]*rel="self"/);
});

test("feeds/funding.xml — 200 + application/rss+xml + RSS 2.0 shell", async () => {
  const res = await fundingGET();
  assert.equal(res.status, 200);
  const ct = res.headers.get("content-type") ?? "";
  assert.match(ct, /application\/rss\+xml/);
  assert.match(
    res.headers.get("cache-control") ?? "",
    /s-maxage=1800/,
  );
  const body = await res.text();
  assert.ok(body.startsWith('<?xml version="1.0"'));
  assert.match(body, /<rss version="2\.0"/);
  assert.match(body, /<channel>/);
  assert.match(body, /<\/rss>/);
  assert.match(body, /atom:link[^>]*rel="self"/);
});

test("feeds/breakouts.xml — item count stays within the declared cap", async () => {
  const res = await breakoutsGET();
  const body = await res.text();
  const itemCount = (body.match(/<item>/g) ?? []).length;
  assert.ok(itemCount <= 30, `item count ${itemCount} exceeds MAX_ITEMS=30`);
});

test("feeds/funding.xml — item count stays within the declared cap", async () => {
  const res = await fundingGET();
  const body = await res.text();
  const itemCount = (body.match(/<item>/g) ?? []).length;
  assert.ok(itemCount <= 30, `item count ${itemCount} exceeds MAX_ITEMS=30`);
});

// ---------------------------------------------------------------------------
// /feeds/[slug].xml — per-category RSS (PR #3174 + #3185 companion)
// ---------------------------------------------------------------------------

test("feeds/[slug].xml — 200 + application/rss+xml + 15-min cache header", async () => {
  // ai-agents is the canonical first axis in CATEGORIES; every fixture/golden
  // has at least one repo classified into it.
  const res = await callCategoryFeed("ai-agents");
  assert.equal(res.status, 200);
  const ct = res.headers.get("content-type") ?? "";
  assert.match(ct, /application\/rss\+xml/);
  assert.match(
    res.headers.get("cache-control") ?? "",
    /s-maxage=900/,
  );
  assert.match(
    res.headers.get("cache-control") ?? "",
    /stale-while-revalidate=3600/,
  );
});

test("feeds/[slug].xml — valid RSS 2.0 shell with at least one <item>", async () => {
  const res = await callCategoryFeed("ai-agents");
  const body = await res.text();
  assert.ok(body.startsWith('<?xml version="1.0"'));
  assert.match(body, /<rss version="2\.0"/);
  assert.match(body, /<channel>/);
  assert.match(body, /<\/rss>/);
  assert.match(body, /atom:link[^>]*rel="self"/);
  // Either real repos or the indexing/stale placeholder — both surface at
  // least one <item> element so feed readers don't see an empty channel.
  const itemCount = (body.match(/<item>/g) ?? []).length;
  assert.ok(itemCount >= 1, `expected ≥1 <item>, got ${itemCount}`);
});

test("feeds/[slug].xml — item count stays within MAX_ITEMS=25 cap", async () => {
  const res = await callCategoryFeed("ai-agents");
  const body = await res.text();
  const itemCount = (body.match(/<item>/g) ?? []).length;
  assert.ok(itemCount <= 25, `item count ${itemCount} exceeds MAX_ITEMS=25`);
});

test("feeds/[slug].xml — channel <title> includes the category name", async () => {
  const res = await callCategoryFeed("ai-agents");
  const body = await res.text();
  // Channel title is "TrendingRepo — {category.name}". Match the category
  // name as a substring inside the channel title (escaped variants of `&`
  // notwithstanding — none of the v1 categories contain unsafe characters).
  const category = CATEGORIES.find((c) => c.id === "ai-agents")!;
  assert.ok(
    body.includes(`<title>TrendingRepo — ${category.name}</title>`) ||
      body.includes(`<title>TrendingRepo &mdash; ${category.name}</title>`),
    `channel title missing category name ${category.name}`,
  );
});

test("feeds/[slug].xml — unknown slug returns 404", async () => {
  const res = await callCategoryFeed("totally-not-a-category-zzz");
  assert.equal(res.status, 404);
});

test("feeds/[slug].xml — every CATEGORIES slug resolves to 200 RSS", async () => {
  // Cheap smoke: every category id ships a working feed. Catches
  // CATEGORIES typos / accidental id mismatches without needing per-slug
  // golden files. Runs N requests sequentially to keep memory bounded.
  for (const cat of CATEGORIES) {
    const res = await callCategoryFeed(cat.id);
    assert.equal(res.status, 200, `slug ${cat.id} returned ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    assert.match(
      ct,
      /application\/rss\+xml/,
      `slug ${cat.id} content-type=${ct}`,
    );
  }
});

test("feeds/[slug].xml — XML escapes `&` / `<` / `>` in repo names via the serializer", async () => {
  // The XML escaping itself is exhaustively tested in feeds-rss.test.ts.
  // Here we verify the per-category route emits a well-formed document with
  // no raw unescaped `&` in element text (a parse error in any RSS reader).
  const res = await callCategoryFeed("ai-agents");
  const body = await res.text();
  // Strip CDATA + attribute regions before scanning for raw `&` — those
  // legitimately contain HTML & literal ampersands per the RSS 2.0 spec.
  const stripped = body
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/\b\w+="[^"]*"/g, "");
  // Any remaining `&` MUST be a valid XML entity reference.
  const ampMatches = stripped.match(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g);
  assert.equal(
    ampMatches,
    null,
    `unescaped & in element text: ${JSON.stringify(ampMatches)}`,
  );
});

// ---------------------------------------------------------------------------
// /feeds — JSON index of every published RSS feed
// ---------------------------------------------------------------------------

test("/feeds index — 200 + application/json + curated + categories arrays", async () => {
  const res = await feedsIndexGET();
  assert.equal(res.status, 200);
  const ct = res.headers.get("content-type") ?? "";
  assert.match(ct, /application\/json/);
  const body = (await res.json()) as {
    feeds: {
      curated: Array<{ id: string; feed: string }>;
      categories: Array<{ id: string; feed: string }>;
    };
    counts: { total: number; curated: number; categories: number };
  };
  assert.ok(Array.isArray(body.feeds.curated));
  assert.ok(Array.isArray(body.feeds.categories));
  // Curated set is the 3 cross-cut feeds (breakouts/funding/agent-commerce).
  assert.equal(body.feeds.curated.length, 3);
  // One entry per CATEGORIES axis — guards the file from drift when the
  // taxonomy expands (e.g. 15 → 32 in PR #3174).
  assert.equal(body.feeds.categories.length, CATEGORIES.length);
  assert.equal(
    body.counts.total,
    body.feeds.curated.length + body.feeds.categories.length,
  );
});

test("/feeds index — every category entry points at /feeds/{id}.xml", async () => {
  const res = await feedsIndexGET();
  const body = (await res.json()) as {
    feeds: { categories: Array<{ id: string; feed: string; page: string }> };
  };
  for (const entry of body.feeds.categories) {
    const cat = CATEGORIES.find((c) => c.id === entry.id);
    assert.ok(cat, `unknown category id in index: ${entry.id}`);
    assert.match(entry.feed, new RegExp(`/feeds/${entry.id}\\.xml$`));
    assert.match(entry.page, new RegExp(`/categories/${entry.id}$`));
  }
});
