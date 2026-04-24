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
import { GET as breakoutsGET } from "../../../app/feeds/breakouts.xml/route";
import { GET as fundingGET } from "../../../app/feeds/funding.xml/route";

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
