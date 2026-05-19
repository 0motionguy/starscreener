// StarScreener Pipeline — GET /api/compare tests.
//
// Covers:
//   - 200 with profile objects for known repos
//   - `profile: null, error: "not_found"` for an unknown repo in a
//     mixed list (NOT a 404 on the overall response)
//   - 400 `too_many_repos` when > 4 repos are requested
//   - 400 `missing_repos` when the `repos` param is absent/empty
//   - 400 `invalid_repo` when a slug fails the regex
//   - Cache-Control header is present on the 200 path
//
// Run with:
//   npx tsx --test src/lib/pipeline/__tests__/compare-endpoint.test.ts

// Disable file persistence BEFORE the pipeline / singleton modules are
// imported — otherwise ensureReady() would hydrate from .data/*.jsonl and
// mix real data into our fixtures. Mirrors canonical-profile-endpoint.test.ts.
process.env.STARSCREENER_PERSIST = "false";

// Seed deterministic JSONL fixtures so vercel/next.js and ollama/ollama
// resolve in CI runners that don't carry the live .data/repos.jsonl payload.
import { ensurePipelineRepoJsonlFixture } from "./fixtures/pipeline-repo-fixtures";
ensurePipelineRepoJsonlFixture();

import { test } from "node:test";
import assert from "node:assert/strict";

// Known-resolvable fixture: vercel/next.js is guaranteed to be present via
// the persisted repos.jsonl fallback in derived-repos.ts. Same contract the
// canonical-profile and mentions tests rely on.
const KNOWN_A = "vercel/next.js";
const KNOWN_B = "ollama/ollama";
const UNKNOWN = "this-owner-definitely/does-not-exist-xyz-9999";

async function invokeRoute(query: string): Promise<Response> {
  const { GET } = await import("../../../app/api/compare/route");
  const url = `http://localhost/api/compare${query}`;
  const req = new Request(url);
  return GET(req as never);
}

interface RepoRow {
  fullName: string;
  profile: unknown | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// 200 path
// ---------------------------------------------------------------------------

test("200 with profile objects for two known repos", async () => {
  const res = await invokeRoute(
    `?repos=${encodeURIComponent(`${KNOWN_A},${KNOWN_B}`)}`,
  );
  assert.equal(res.status, 200);

  const body = (await res.json()) as {
    ok: boolean;
    fetchedAt: string;
    repos: RepoRow[];
  };

  assert.equal(body.ok, true);
  assert.equal(typeof body.fetchedAt, "string");
  assert.ok(!Number.isNaN(Date.parse(body.fetchedAt)), "fetchedAt is ISO");
  assert.ok(Array.isArray(body.repos), "repos must be an array");
  assert.equal(body.repos.length, 2);

  const [rowA, rowB] = body.repos;
  assert.equal(rowA.fullName, KNOWN_A);
  assert.equal(rowB.fullName, KNOWN_B);
  assert.ok(
    rowA.profile !== null,
    `expected a profile object for ${KNOWN_A}, got null`,
  );
  assert.ok(
    rowB.profile !== null,
    `expected a profile object for ${KNOWN_B}, got null`,
  );
});

test("mixed known/unknown: unknown row reports error=not_found without failing the batch", async () => {
  const res = await invokeRoute(
    `?repos=${encodeURIComponent(`${KNOWN_A},${UNKNOWN}`)}`,
  );
  assert.equal(res.status, 200, "overall response stays 200");

  const body = (await res.json()) as { repos: RepoRow[] };
  assert.equal(body.repos.length, 2);

  const knownRow = body.repos[0];
  const unknownRow = body.repos[1];

  assert.equal(knownRow.fullName, KNOWN_A);
  assert.ok(knownRow.profile !== null, "known repo still has a profile");
  assert.equal(knownRow.error, undefined);

  assert.equal(unknownRow.fullName, UNKNOWN);
  assert.equal(unknownRow.profile, null);
  assert.equal(unknownRow.error, "not_found");
});

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

test("400 too_many_repos when more than 5 repos are requested", async () => {
  const names = [
    "a/b",
    "c/d",
    "e/f",
    "g/h",
    "i/j",
    "k/l", // 6 — one over the cap (MAX_REPOS = 5 in src/app/api/compare/route.ts)
  ].join(",");
  const res = await invokeRoute(`?repos=${encodeURIComponent(names)}`);
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; code?: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, "too_many_repos");
});

test("400 missing_repos when the repos param is absent", async () => {
  const res = await invokeRoute("");
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; code?: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, "missing_repos");
});

test("400 missing_repos when the repos param is empty", async () => {
  const res = await invokeRoute("?repos=");
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; code?: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, "missing_repos");
});

test("400 invalid_repo when a slug fails the regex", async () => {
  const res = await invokeRoute(
    `?repos=${encodeURIComponent("not a slug,also/bad&invalid")}`,
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; code?: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, "invalid_repo");
});

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

test("Cache-Control header present on 200 response", async () => {
  const res = await invokeRoute(`?repos=${encodeURIComponent(KNOWN_A)}`);
  assert.equal(res.status, 200);
  const cc = res.headers.get("Cache-Control");
  assert.ok(cc, "Cache-Control header must be set");
  assert.match(cc!, /s-maxage=30/);
  assert.match(cc!, /stale-while-revalidate=60/);
});
