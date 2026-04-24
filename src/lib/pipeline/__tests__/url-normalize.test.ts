// StarScreener Pipeline — `normalizeUrl` tests.
//
// Verifies the URL canonicalization rules that `MentionStore` uses to
// dedup cross-source RepoMention rows: tracking-param stripping, host
// lowercasing + www. stripping, trailing-slash normalization, query-param
// sort determinism, fragment drop, and graceful malformed-input handling.

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeUrl } from "../adapters/normalizer";

test("normalizeUrl returns null for null / undefined / empty", () => {
  assert.equal(normalizeUrl(null), null);
  assert.equal(normalizeUrl(undefined), null);
  assert.equal(normalizeUrl(""), null);
  assert.equal(normalizeUrl("   "), null);
});

test("normalizeUrl strips utm_* params", () => {
  const out = normalizeUrl(
    "https://github.com/vercel/next.js?utm_source=hn&utm_medium=social&utm_campaign=x",
  );
  assert.equal(out, "https://github.com/vercel/next.js");
});

test("normalizeUrl strips ref, fbclid, gclid, mc_cid, mc_eid, _ga", () => {
  const out = normalizeUrl(
    "https://github.com/vercel/next.js?ref=twitter&fbclid=abc&gclid=xyz&mc_cid=1&mc_eid=2&_ga=GA1.2",
  );
  assert.equal(out, "https://github.com/vercel/next.js");
});

test("normalizeUrl strips twitter s + t share tokens", () => {
  const out = normalizeUrl("https://twitter.com/foo/status/123?s=20&t=abc");
  assert.equal(out, "https://twitter.com/foo/status/123");
});

test("normalizeUrl keeps non-tracking params", () => {
  const out = normalizeUrl(
    "https://github.com/vercel/next.js/issues?state=open&utm_source=x",
  );
  assert.equal(out, "https://github.com/vercel/next.js/issues?state=open");
});

test("normalizeUrl sorts remaining query params alphabetically", () => {
  const a = normalizeUrl("https://example.com/path?z=1&a=2&m=3");
  const b = normalizeUrl("https://example.com/path?a=2&m=3&z=1");
  assert.equal(a, b);
  assert.equal(a, "https://example.com/path?a=2&m=3&z=1");
});

test("normalizeUrl lowercases host and strips leading www.", () => {
  assert.equal(
    normalizeUrl("https://WWW.GitHub.com/Vercel/Next.js"),
    "https://github.com/Vercel/Next.js",
  );
});

test("normalizeUrl preserves case in pathname (case-sensitive on most servers)", () => {
  // github.com paths are case-sensitive for user/repo identity — we do not
  // lowercase. We DO collapse host case (RFC 3986 §6.2.2).
  assert.equal(
    normalizeUrl("https://github.com/Vercel/Next.js"),
    "https://github.com/Vercel/Next.js",
  );
});

test("normalizeUrl strips a single trailing slash from non-root paths", () => {
  assert.equal(
    normalizeUrl("https://github.com/vercel/next.js/"),
    "https://github.com/vercel/next.js",
  );
});

test("normalizeUrl keeps the root slash '/'", () => {
  assert.equal(normalizeUrl("https://example.com/"), "https://example.com/");
});

test("normalizeUrl drops the fragment", () => {
  assert.equal(
    normalizeUrl("https://github.com/vercel/next.js#readme"),
    "https://github.com/vercel/next.js",
  );
});

test("normalizeUrl canonicalizes all three vercel/next.js variants to the same URL", () => {
  const a = normalizeUrl("https://github.com/vercel/next.js");
  const b = normalizeUrl("https://github.com/vercel/next.js/");
  const c = normalizeUrl(
    "https://www.github.com/vercel/next.js?utm_source=x",
  );
  assert.equal(a, b);
  assert.equal(a, c);
  assert.equal(a, "https://github.com/vercel/next.js");
});

test("normalizeUrl handles malformed input gracefully (no throw)", () => {
  // Bare strings that aren't parseable as absolute URLs fall back to a
  // trimmed+lowercased form — still deterministic for dedup.
  assert.equal(normalizeUrl("not a url"), "not a url");
  assert.equal(normalizeUrl("  /relative/path  "), "/relative/path");
  assert.equal(normalizeUrl("HTTP://"), "http://");
});

test("normalizeUrl preserves scheme as-is (does not upgrade http to https)", () => {
  // We intentionally don't force https — that would misrepresent the source.
  assert.equal(
    normalizeUrl("http://example.com/path"),
    "http://example.com/path",
  );
  assert.equal(
    normalizeUrl("https://example.com/path"),
    "https://example.com/path",
  );
});

test("normalizeUrl preserves repeated query keys but sorts them", () => {
  // ?a=1&a=2 — both kept, order is deterministic (value-sorted within key).
  const out = normalizeUrl("https://example.com/?a=2&a=1");
  assert.equal(out, "https://example.com/?a=1&a=2");
});
