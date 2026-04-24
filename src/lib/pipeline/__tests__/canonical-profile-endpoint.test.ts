// StarScreener Pipeline — GET /api/repos/[owner]/[name] tests.
//
// Covers:
//   - `?v=2` / default — canonical shape for a known repo (top-level keys
//     + types sanity) + 200
//   - `?v=1` — legacy shape unchanged, 200
//   - Default (no `?v=`) routes to v2
//   - 404 on unknown repo (both shapes for the envelope difference)
//   - 400 on invalid slug
//   - Cache-Control header present on 200s
//
// Run with:
//   npx tsx --test src/lib/pipeline/__tests__/canonical-profile-endpoint.test.ts

// Disable file persistence BEFORE the pipeline / singleton modules are
// imported — otherwise ensureReady() would hydrate from .data/*.jsonl and
// mix real data into our fixture counts. Mirrors mentions-endpoint.test.ts.
process.env.STARSCREENER_PERSIST = "false";

import { test, before } from "node:test";
import assert from "node:assert/strict";

import type { RepoMention } from "../types";
import { mentionStore } from "../storage/singleton";

// ---------------------------------------------------------------------------
// Fixture repo — shared with mentions-endpoint.test.ts for the same reason:
// vercel/next.js is guaranteed to resolve via derived-repos' persisted
// fallback without test monkey-patching.
// ---------------------------------------------------------------------------

const FIXTURE_OWNER = "vercel";
const FIXTURE_NAME = "next.js";
const FIXTURE_FULL_NAME = `${FIXTURE_OWNER}/${FIXTURE_NAME}`;
const FIXTURE_REPO_ID = "vercel--next-js";

function mkMention(
  overrides: Partial<RepoMention> & {
    id: string;
    postedAt: string;
    platform: RepoMention["platform"];
  },
): RepoMention {
  return {
    id: overrides.id,
    repoId: overrides.repoId ?? FIXTURE_REPO_ID,
    platform: overrides.platform,
    author: overrides.author ?? "alice",
    authorFollowers: overrides.authorFollowers ?? null,
    content: overrides.content ?? "test content",
    url: overrides.url ?? `https://example.com/${overrides.id}`,
    sentiment: overrides.sentiment ?? "neutral",
    engagement: overrides.engagement ?? 0,
    reach: overrides.reach ?? 0,
    postedAt: overrides.postedAt,
    discoveredAt: overrides.discoveredAt ?? overrides.postedAt,
    isInfluencer: overrides.isInfluencer ?? false,
  };
}

function buildSeedMentions(): RepoMention[] {
  return [
    mkMention({
      id: "canon-r-01",
      platform: "reddit",
      postedAt: "2026-04-22T12:00:00.000Z",
    }),
    mkMention({
      id: "canon-hn-01",
      platform: "hackernews",
      postedAt: "2026-04-22T11:00:00.000Z",
    }),
    mkMention({
      id: "canon-bs-01",
      platform: "bluesky",
      postedAt: "2026-04-21T09:00:00.000Z",
    }),
  ];
}

function clearMentionStore(): void {
  const store = mentionStore as unknown as {
    byRepo: Map<string, unknown>;
    aggregates: Map<string, unknown>;
  };
  store.byRepo.clear();
  store.aggregates.clear();
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

before(() => {
  clearMentionStore();
  for (const m of buildSeedMentions()) {
    mentionStore.append(m);
  }
});

// ---------------------------------------------------------------------------
// Route invocation helper
// ---------------------------------------------------------------------------

async function invokeRoute(
  owner: string,
  name: string,
  query: string = "",
): Promise<Response> {
  const { GET } = await import(
    "../../../app/api/repos/[owner]/[name]/route"
  );
  const url = `http://localhost/api/repos/${owner}/${name}${query}`;
  const req = new Request(url);
  return GET(req as never, {
    params: Promise.resolve({ owner, name }),
  });
}

// ---------------------------------------------------------------------------
// Tests — v2 canonical shape
// ---------------------------------------------------------------------------

test("v=2 returns canonical shape with all top-level keys", async () => {
  const res = await invokeRoute(FIXTURE_OWNER, FIXTURE_NAME, "?v=2");
  assert.equal(res.status, 200);

  const body = (await res.json()) as Record<string, unknown>;

  // Envelope.
  assert.equal(body.ok, true);
  assert.equal(body.v, 2);
  assert.equal(typeof body.fetchedAt, "string");
  assert.ok(
    !Number.isNaN(Date.parse(body.fetchedAt as string)),
    "fetchedAt must parse as ISO",
  );

  // Core payload keys.
  for (const key of [
    "repo",
    "score",
    "reasons",
    "mentions",
    "freshness",
    "twitter",
    "npm",
    "productHunt",
    "revenue",
    "funding",
    "related",
  ]) {
    assert.ok(
      key in body,
      `v2 shape missing top-level key: ${key}`,
    );
  }

  // Nested shape smoke.
  const repo = body.repo as { fullName?: string };
  assert.equal(
    repo.fullName,
    FIXTURE_FULL_NAME,
    "repo.fullName must match slug",
  );

  const mentions = body.mentions as {
    recent: unknown[];
    nextCursor: unknown;
    countsBySource: Record<string, number>;
  };
  assert.ok(Array.isArray(mentions.recent), "mentions.recent is array");
  assert.ok(
    mentions.nextCursor === null || typeof mentions.nextCursor === "string",
    "mentions.nextCursor is string | null",
  );
  assert.equal(typeof mentions.countsBySource, "object");

  // Every seeded mention is reflected in countsBySource, keyed by platform.
  assert.equal(mentions.countsBySource.reddit, 1);
  assert.equal(mentions.countsBySource.hackernews, 1);
  assert.equal(mentions.countsBySource.bluesky, 1);

  const npm = body.npm as {
    packages: unknown[];
    dailyDownloads: Record<string, unknown>;
    dependents: Record<string, unknown>;
  };
  assert.ok(Array.isArray(npm.packages), "npm.packages is array");
  assert.equal(typeof npm.dailyDownloads, "object");
  assert.equal(typeof npm.dependents, "object");

  const revenue = body.revenue as {
    verified: unknown;
    selfReported: unknown;
    trustmrrClaim: unknown;
  };
  for (const key of ["verified", "selfReported", "trustmrrClaim"] as const) {
    assert.ok(
      key in revenue,
      `revenue is missing nested key: ${key}`,
    );
  }

  assert.ok(Array.isArray(body.reasons), "reasons is array");
  assert.ok(Array.isArray(body.funding), "funding is array");
  assert.ok(Array.isArray(body.related), "related is array");

  const freshness = body.freshness as {
    fetchedAt: string;
    sources: Record<string, unknown>;
  };
  assert.equal(typeof freshness.fetchedAt, "string");
  assert.equal(typeof freshness.sources, "object");
});

test("default (no ?v) routes to v2", async () => {
  const res = await invokeRoute(FIXTURE_OWNER, FIXTURE_NAME);
  assert.equal(res.status, 200);

  const body = (await res.json()) as { ok?: boolean; v?: number };
  assert.equal(body.ok, true);
  assert.equal(body.v, 2);
});

test("v=anything-else routes to v2 (typo-safe default)", async () => {
  const res = await invokeRoute(FIXTURE_OWNER, FIXTURE_NAME, "?v=banana");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { v?: number };
  assert.equal(body.v, 2);
});

// ---------------------------------------------------------------------------
// Tests — v1 legacy shape
// ---------------------------------------------------------------------------

test("v=1 returns legacy shape unchanged", async () => {
  const res = await invokeRoute(FIXTURE_OWNER, FIXTURE_NAME, "?v=1");
  assert.equal(res.status, 200);

  const body = (await res.json()) as Record<string, unknown>;

  // Legacy shape must NOT carry the v2 envelope markers.
  assert.ok(!("v" in body), "legacy shape must not include `v`");
  assert.ok(!("ok" in body), "legacy shape must not include `ok`");
  assert.ok(!("fetchedAt" in body), "legacy shape must not include `fetchedAt`");

  // Legacy keys.
  for (const key of [
    "repo",
    "score",
    "category",
    "reasons",
    "social",
    "mentions",
    "twitterSignal",
    "whyMoving",
    "relatedRepos",
    "twitterAvailable",
  ]) {
    assert.ok(
      key in body,
      `v1 shape missing legacy key: ${key}`,
    );
  }

  // Legacy contract: score/category/reasons are always null in v1 because
  // the old endpoint never wired them. `mentions` is an array.
  assert.equal(body.score, null);
  assert.equal(body.category, null);
  assert.equal(body.reasons, null);
  assert.ok(Array.isArray(body.mentions), "legacy mentions is array");
  assert.ok(Array.isArray(body.relatedRepos), "legacy relatedRepos is array");
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

test("400 on invalid owner slug", async () => {
  const res = await invokeRoute("bad owner", "repo");
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; code?: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, "invalid_slug");
});

test("400 on invalid name slug", async () => {
  const res = await invokeRoute("owner", "bad/name");
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; code?: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, "invalid_slug");
});

test("v=2 returns 404 on unknown repo with envelope", async () => {
  const res = await invokeRoute(
    "this-owner-definitely",
    "does-not-exist-xyz-9999",
    "?v=2",
  );
  assert.equal(res.status, 404);
  const body = (await res.json()) as { ok: boolean; code?: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, "repo_not_found");
});

test("v=1 returns 404 on unknown repo with legacy envelope", async () => {
  const res = await invokeRoute(
    "this-owner-definitely",
    "does-not-exist-xyz-9999",
    "?v=1",
  );
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error?: string; ok?: boolean };
  // Legacy envelope: { error }, no `ok`.
  assert.equal(body.error, "Repo not found");
  assert.ok(!("ok" in body), "legacy 404 must not include `ok`");
});

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

test("Cache-Control header present on v=2 200", async () => {
  const res = await invokeRoute(FIXTURE_OWNER, FIXTURE_NAME, "?v=2");
  assert.equal(res.status, 200);
  const cc = res.headers.get("Cache-Control");
  assert.ok(cc, "Cache-Control must be set");
  assert.match(cc!, /s-maxage=30/);
  assert.match(cc!, /stale-while-revalidate=60/);
});

test("Cache-Control header present on v=1 200", async () => {
  const res = await invokeRoute(FIXTURE_OWNER, FIXTURE_NAME, "?v=1");
  assert.equal(res.status, 200);
  const cc = res.headers.get("Cache-Control");
  assert.ok(cc, "Cache-Control must be set");
  assert.match(cc!, /s-maxage=30/);
  assert.match(cc!, /stale-while-revalidate=60/);
});
