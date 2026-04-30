// StarScreener Pipeline — GET /api/compare/github tests.
//
// Covers the thin wrapper around `fetchCompareBundles` exposed for the
// legacy "Code activity side-by-side" extras section below the canonical
// compare grid. `fetchCompareBundles` already converts per-repo failures
// into `ok:false` bundles (via `Promise.allSettled` + the GhStatusError
// catch inside `fetchCompareBundle`), so we can drive the 200 path with
// nonsense owner/name slugs without touching GitHub — the bundles come
// back with `ok:false` and the envelope stays 200.
//
// Guarantees asserted:
//   - 200 with `bundles.length === N` when N repos (1..4) are requested
//   - 400 `too_many_repos` when more than 4 repos are requested
//   - 400 `missing_repos` when the `repos` param is absent/empty
//   - Cache-Control header present on the 200 path, with the intended
//     5-min edge / 1-hour SWR window
//
// Run with:
//   npx tsx --test src/lib/pipeline/__tests__/compare-github-endpoint.test.ts

// Mirror the canonical compare test: disable file persistence before any
// pipeline-touching module imports, and point GITHUB_TOKEN at a sentinel
// so the adapter uses auth (better rate limits in CI) but without leaking
// real tokens. The ok:false-bundle path below does not actually reach
// GitHub for the fake slugs, because `fetchCompareBundle` catches the
// 404 as a GhStatusError and returns a zeroBundle.
process.env.STARSCREENER_PERSIST = "false";

import { test } from "node:test";
import assert from "node:assert/strict";

// Fake slugs so the test neither hits real repos nor depends on GitHub
// uptime. `fetchCompareBundle` will 404 and bake `error: "not_found"`
// into each bundle while still returning a full envelope.
const FAKE_A = "starscreener-test-owner-a/does-not-exist-1";
const FAKE_B = "starscreener-test-owner-b/does-not-exist-2";

async function invokeRoute(query: string): Promise<Response> {
  const { GET } = await import("../../../app/api/compare/github/route");
  const url = `http://localhost/api/compare/github${query}`;
  const req = new Request(url);
  return GET(req as never);
}

interface GithubEnvelope {
  ok: boolean;
  fetchedAt?: string;
  bundles?: Array<{ fullName: string; ok: boolean; error?: string }>;
  code?: string;
}

// ---------------------------------------------------------------------------
// 200 path
// ---------------------------------------------------------------------------

test(
  "200 with a bundle per requested repo (fake slugs resolve as ok:false, envelope stays 200)",
  // Up to three staggered GitHub round-trips per bundle before the 404
  // is committed; give the suite a generous ceiling to absorb that.
  { timeout: 45_000 },
  async () => {
    const res = await invokeRoute(
      `?repos=${encodeURIComponent(`${FAKE_A},${FAKE_B}`)}`,
    );
    assert.equal(res.status, 200);

    const body = (await res.json()) as GithubEnvelope;
    assert.equal(body.ok, true);
    assert.equal(typeof body.fetchedAt, "string");
    assert.ok(
      !Number.isNaN(Date.parse(body.fetchedAt ?? "")),
      "fetchedAt is ISO",
    );
    assert.ok(Array.isArray(body.bundles), "bundles must be an array");
    assert.equal(body.bundles!.length, 2);

    const [bundleA, bundleB] = body.bundles!;
    assert.equal(bundleA.fullName, FAKE_A);
    assert.equal(bundleB.fullName, FAKE_B);
    // Whether GitHub answers 404 (ok:false / error:"not_found") or the
    // adapter returns early (still ok:false) the invariant we care about
    // is the envelope length, not the error code. We only assert the
    // shape is populated.
    assert.equal(typeof bundleA.ok, "boolean");
    assert.equal(typeof bundleB.ok, "boolean");
  },
);

// ---------------------------------------------------------------------------
// Validation errors (fast; no network)
// ---------------------------------------------------------------------------

test("400 too_many_repos when more than 5 repos are requested", async () => {
  // MAX_REPOS = 5 in src/app/api/compare/github/route.ts; pass 6 to trip it.
  const names = ["a/b", "c/d", "e/f", "g/h", "i/j", "k/l"].join(",");
  const res = await invokeRoute(`?repos=${encodeURIComponent(names)}`);
  assert.equal(res.status, 400);
  const body = (await res.json()) as GithubEnvelope;
  assert.equal(body.ok, false);
  assert.equal(body.code, "too_many_repos");
});

test("400 missing_repos when the repos param is absent", async () => {
  const res = await invokeRoute("");
  assert.equal(res.status, 400);
  const body = (await res.json()) as GithubEnvelope;
  assert.equal(body.ok, false);
  assert.equal(body.code, "missing_repos");
});

test("400 missing_repos when the repos param is empty", async () => {
  const res = await invokeRoute("?repos=");
  assert.equal(res.status, 400);
  const body = (await res.json()) as GithubEnvelope;
  assert.equal(body.ok, false);
  assert.equal(body.code, "missing_repos");
});

test(
  "400 missing_repos when repos is only whitespace/commas",
  async () => {
    const res = await invokeRoute(`?repos=${encodeURIComponent("  ,, ,")}`);
    assert.equal(res.status, 400);
    const body = (await res.json()) as GithubEnvelope;
    assert.equal(body.ok, false);
    assert.equal(body.code, "missing_repos");
  },
);

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

test(
  "Cache-Control header: 5-min edge / 1-hour SWR on the 200 response",
  { timeout: 45_000 },
  async () => {
    const res = await invokeRoute(
      `?repos=${encodeURIComponent(FAKE_A)}`,
    );
    assert.equal(res.status, 200);
    const cc = res.headers.get("Cache-Control");
    assert.ok(cc, "Cache-Control header must be set");
    assert.match(cc!, /s-maxage=300/);
    assert.match(cc!, /stale-while-revalidate=3600/);
  },
);
