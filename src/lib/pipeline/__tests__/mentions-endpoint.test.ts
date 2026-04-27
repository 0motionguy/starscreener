// StarScreener Pipeline — GET /api/repos/[owner]/[name]/mentions tests.
//
// Covers:
//   - slug validation (400)
//   - query param validation (source / limit / cursor → 400)
//   - unknown-repo handling (404)
//   - default limit + ordering + shape (200)
//   - cursor walk with coverage + no-duplicate invariants
//   - source-filter narrowing
//   - cache-control header presence
//
// Run with: npx tsx --test src/lib/pipeline/__tests__/mentions-endpoint.test.ts

// Disable file persistence BEFORE the pipeline / singleton modules are
// imported. The route calls `pipeline.ensureReady()` which hydrates the
// mention store from `.data/mentions.jsonl`; with persistence on, that
// would mix real persisted data into our fixture counts.
process.env.STARSCREENER_PERSIST = "false";

// Seed the derived-repos JSONL fixture so vercel/next.js resolves on cold
// CI runners that don't carry the live .data/repos.jsonl payload.
import { ensurePipelineRepoJsonlFixture } from "./fixtures/pipeline-repo-fixtures";
ensurePipelineRepoJsonlFixture();

import { test, before } from "node:test";
import assert from "node:assert/strict";

import type { RepoMention } from "../types";
import { mentionStore } from "../storage/singleton";

// ---------------------------------------------------------------------------
// Fixture repo
//
// We piggyback on a repo that `getDerivedRepoByFullName` resolves from the
// static JSON + pipeline-persisted JSONL (vercel/next.js is guaranteed to be
// present via the persisted repos.jsonl fallback in derived-repos.ts). That
// keeps the test out of the business of monkey-patching the derived cache
// while still exercising the real resolution path end-to-end.
// ---------------------------------------------------------------------------

const FIXTURE_OWNER = "vercel";
const FIXTURE_NAME = "next.js";
const FIXTURE_FULL_NAME = `${FIXTURE_OWNER}/${FIXTURE_NAME}`;
const FIXTURE_REPO_ID = "vercel--next-js";

function mkMention(
  overrides: Partial<RepoMention> & { id: string; postedAt: string; platform: RepoMention["platform"] },
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

/**
 * Seed set:
 *   - 12 mentions total
 *   - 3 platforms (reddit, hackernews, bluesky)
 *   - spread across 3 days (2026-04-20, 2026-04-21, 2026-04-22)
 *   - some ties on postedAt so the id-tiebreak path is exercised
 */
function buildSeedMentions(): RepoMention[] {
  return [
    mkMention({ id: "r-01", platform: "reddit", postedAt: "2026-04-22T12:00:00.000Z" }),
    mkMention({ id: "r-02", platform: "reddit", postedAt: "2026-04-22T11:00:00.000Z" }),
    mkMention({ id: "r-03", platform: "reddit", postedAt: "2026-04-21T08:00:00.000Z" }),
    mkMention({ id: "r-04", platform: "reddit", postedAt: "2026-04-20T08:00:00.000Z" }),
    mkMention({ id: "hn-01", platform: "hackernews", postedAt: "2026-04-22T12:00:00.000Z" }), // tie with r-01
    mkMention({ id: "hn-02", platform: "hackernews", postedAt: "2026-04-21T20:00:00.000Z" }),
    mkMention({ id: "hn-03", platform: "hackernews", postedAt: "2026-04-21T19:00:00.000Z" }),
    mkMention({ id: "hn-04", platform: "hackernews", postedAt: "2026-04-20T10:00:00.000Z" }),
    mkMention({ id: "bs-01", platform: "bluesky", postedAt: "2026-04-22T09:00:00.000Z" }),
    mkMention({ id: "bs-02", platform: "bluesky", postedAt: "2026-04-21T09:00:00.000Z" }),
    mkMention({ id: "bs-03", platform: "bluesky", postedAt: "2026-04-20T09:00:00.000Z" }),
    mkMention({ id: "bs-04", platform: "bluesky", postedAt: "2026-04-20T08:30:00.000Z" }),
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
// Shared one-shot setup
//
// We seed the singleton stores once at the top of the suite. Each test reads
// the same fixture; none of them mutate the store, so sharing is safe and
// avoids re-paying the seed cost.
// ---------------------------------------------------------------------------

before(() => {
  // Singleton stores ship empty in-process (hydration only runs from inside
  // pipeline.ensureReady()); seed a clean, deterministic set keyed to the
  // fixture repo id so our counts don't drift as production data changes.
  clearMentionStore();
  for (const m of buildSeedMentions()) {
    mentionStore.append(m);
  }
});

// ---------------------------------------------------------------------------
// Utilities to invoke the route handler
// ---------------------------------------------------------------------------

async function invokeRoute(
  owner: string,
  name: string,
  query: string = "",
): Promise<Response> {
  const { GET } = await import(
    "../../../app/api/repos/[owner]/[name]/mentions/route"
  );
  const url = `http://localhost/api/repos/${owner}/${name}/mentions${query}`;
  const req = new Request(url);
  return GET(req as never, {
    params: Promise.resolve({ owner, name }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("400 on invalid owner slug", async () => {
  const res = await invokeRoute("bad owner", "repo");
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; error: string; code?: string };
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

test("400 on invalid source value", async () => {
  const res = await invokeRoute(
    FIXTURE_OWNER,
    FIXTURE_NAME,
    "?source=mastodon",
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; code?: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, "invalid_source");
});

test("400 on limit > 200", async () => {
  const res = await invokeRoute(
    FIXTURE_OWNER,
    FIXTURE_NAME,
    "?limit=201",
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code?: string };
  assert.equal(body.code, "invalid_limit");
});

test("400 on limit < 1", async () => {
  const res = await invokeRoute(
    FIXTURE_OWNER,
    FIXTURE_NAME,
    "?limit=0",
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code?: string };
  assert.equal(body.code, "invalid_limit");
});

test("400 on non-integer limit", async () => {
  const res = await invokeRoute(
    FIXTURE_OWNER,
    FIXTURE_NAME,
    "?limit=abc",
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code?: string };
  assert.equal(body.code, "invalid_limit");
});

test("400 on malformed cursor", async () => {
  // Not base64, not JSON once decoded.
  const res = await invokeRoute(
    FIXTURE_OWNER,
    FIXTURE_NAME,
    "?cursor=!!!not-base64!!!",
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code?: string };
  assert.equal(body.code, "invalid_cursor");
});

test("400 on cursor decoding to wrong JSON shape", async () => {
  const bad = Buffer.from(JSON.stringify({ hello: "world" }), "utf8").toString(
    "base64url",
  );
  const res = await invokeRoute(
    FIXTURE_OWNER,
    FIXTURE_NAME,
    `?cursor=${bad}`,
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code?: string };
  assert.equal(body.code, "invalid_cursor");
});

test("404 on unknown repo slug (valid shape but not registered)", async () => {
  const res = await invokeRoute(
    "this-owner-definitely",
    "does-not-exist-xyz-9999",
  );
  assert.equal(res.status, 404);
  const body = (await res.json()) as { ok: boolean; code?: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, "repo_not_found");
});

test("200 default returns all 12 seeded mentions sorted newest-first", async () => {
  const res = await invokeRoute(FIXTURE_OWNER, FIXTURE_NAME);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    ok: boolean;
    fetchedAt: string;
    repo: string;
    count: number;
    nextCursor: string | null;
    items: RepoMention[];
  };
  assert.equal(body.ok, true);
  assert.equal(body.repo, FIXTURE_FULL_NAME);
  assert.equal(body.count, 12, "all seeded mentions fit under default 50 cap");
  assert.equal(body.items.length, 12);
  assert.equal(body.nextCursor, null, "less than limit → no next cursor");
  // Sort stability: items must be non-increasing on postedAt; ties break by id desc.
  for (let i = 1; i < body.items.length; i++) {
    const prev = body.items[i - 1];
    const cur = body.items[i];
    if (prev.postedAt === cur.postedAt) {
      assert.ok(prev.id > cur.id, `tie-break by id desc failed at i=${i}: ${prev.id} vs ${cur.id}`);
    } else {
      assert.ok(prev.postedAt > cur.postedAt, `postedAt desc failed at i=${i}`);
    }
  }
  // Timestamp shape.
  assert.ok(!Number.isNaN(Date.parse(body.fetchedAt)));
});

test("200 with source filter restricts results to that platform", async () => {
  const res = await invokeRoute(
    FIXTURE_OWNER,
    FIXTURE_NAME,
    "?source=reddit",
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    count: number;
    items: RepoMention[];
  };
  assert.equal(body.count, 4);
  for (const item of body.items) {
    assert.equal(item.platform, "reddit");
  }
});

test("200 with limit=5 returns a non-null nextCursor", async () => {
  const res = await invokeRoute(
    FIXTURE_OWNER,
    FIXTURE_NAME,
    "?limit=5",
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    count: number;
    nextCursor: string | null;
    items: RepoMention[];
  };
  assert.equal(body.count, 5);
  assert.equal(body.items.length, 5);
  assert.ok(body.nextCursor, "more data remaining → nextCursor must be set");
  // nextCursor must be base64url-decodable JSON with postedAt + id.
  const decoded = JSON.parse(Buffer.from(body.nextCursor!, "base64url").toString("utf8"));
  assert.equal(typeof decoded.postedAt, "string");
  assert.equal(typeof decoded.id, "string");
});

test("cursor walk covers every seeded mention exactly once across 3 pages", async () => {
  // Pick a limit that forces 3 pages for the 12-row fixture.
  const LIMIT = 5;
  const seen: RepoMention[] = [];
  let cursor: string | null = null;
  const pagesVisited: number[] = [];

  for (let pageIdx = 0; pageIdx < 10; pageIdx++) {
    const q = cursor
      ? `?limit=${LIMIT}&cursor=${encodeURIComponent(cursor)}`
      : `?limit=${LIMIT}`;
    const res = await invokeRoute(FIXTURE_OWNER, FIXTURE_NAME, q);
    assert.equal(res.status, 200, `page ${pageIdx} status`);
    const body = (await res.json()) as {
      items: RepoMention[];
      nextCursor: string | null;
    };
    seen.push(...body.items);
    pagesVisited.push(body.items.length);
    if (body.nextCursor === null) break;
    cursor = body.nextCursor;
  }

  // Expect exactly 3 pages for 12 rows with limit=5: 5 + 5 + 2.
  assert.deepEqual(pagesVisited, [5, 5, 2], "page sizes");
  // No duplicates.
  const ids = seen.map((m) => m.id);
  assert.equal(
    new Set(ids).size,
    ids.length,
    `duplicate mention ids across pages: ${JSON.stringify(ids)}`,
  );
  // Coverage equals the unpaginated list.
  const unpaginatedRes = await invokeRoute(
    FIXTURE_OWNER,
    FIXTURE_NAME,
  );
  const unpaginatedBody = (await unpaginatedRes.json()) as { items: RepoMention[] };
  assert.equal(seen.length, unpaginatedBody.items.length);
  assert.deepEqual(
    ids,
    unpaginatedBody.items.map((m) => m.id),
    "paginated walk must match unpaginated order exactly",
  );
});

test("cursor walk respects source filter on every page", async () => {
  const LIMIT = 2; // 4 reddit rows → 2 pages
  const seen: RepoMention[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 10; i++) {
    const q = cursor
      ? `?source=reddit&limit=${LIMIT}&cursor=${encodeURIComponent(cursor)}`
      : `?source=reddit&limit=${LIMIT}`;
    const res = await invokeRoute(FIXTURE_OWNER, FIXTURE_NAME, q);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      items: RepoMention[];
      nextCursor: string | null;
    };
    seen.push(...body.items);
    if (body.nextCursor === null) break;
    cursor = body.nextCursor;
  }
  assert.equal(seen.length, 4);
  for (const m of seen) assert.equal(m.platform, "reddit");
  const ids = seen.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicates with source filter");
});

test("Cache-Control header present on 200 response", async () => {
  const res = await invokeRoute(FIXTURE_OWNER, FIXTURE_NAME);
  assert.equal(res.status, 200);
  const cc = res.headers.get("Cache-Control");
  assert.ok(cc, "Cache-Control must be set");
  assert.match(cc!, /s-maxage=30/);
  assert.match(cc!, /stale-while-revalidate=60/);
});
