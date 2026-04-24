// StarScreener Pipeline — `InMemoryMentionStore.append` dedup tests.
//
// Verifies the P1 correctness fix: cross-source dedup by normalizedUrl, with
// fallback to id-based dedup for rows that predate the normalizedUrl field.
// Also verifies that file-persistence round-trips the new optional fields.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { RepoMention } from "../types";

// ---------------------------------------------------------------------------
// Per-test harness — isolated temp DATA_DIR + fresh module instances so the
// file-persistence `DATA_DIR` constant re-reads the env for each test.
// ---------------------------------------------------------------------------

interface Harness {
  dir: string;
  memoryStores: typeof import("../storage/memory-stores");
}

async function setupHarness(): Promise<Harness> {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "starscreener-dedup-"),
  );
  process.env.STARSCREENER_DATA_DIR = dir;
  delete process.env.STARSCREENER_PERSIST;

  const bust = `${Date.now()}-${Math.random()}`;
  const memoryStoresUrl = new URL(
    `../storage/memory-stores.ts?t=${bust}`,
    import.meta.url,
  );
  const memoryStores = (await import(
    memoryStoresUrl.href,
  )) as Harness["memoryStores"];

  return { dir, memoryStores };
}

async function teardown(h: Harness): Promise<void> {
  await fs.rm(h.dir, { recursive: true, force: true });
  delete process.env.STARSCREENER_DATA_DIR;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function mkMention(
  overrides: Partial<RepoMention> & { id: string; url: string },
): RepoMention {
  const base: RepoMention = {
    id: overrides.id,
    repoId: overrides.repoId ?? "vercel--next-js",
    platform: overrides.platform ?? "hackernews",
    author: overrides.author ?? "alice",
    authorFollowers: overrides.authorFollowers ?? null,
    content: overrides.content ?? "cool repo",
    url: overrides.url,
    sentiment: overrides.sentiment ?? "neutral",
    engagement: overrides.engagement ?? 0,
    reach: overrides.reach ?? 0,
    postedAt: overrides.postedAt ?? "2026-04-20T00:00:00.000Z",
    discoveredAt: overrides.discoveredAt ?? "2026-04-20T00:10:00.000Z",
    isInfluencer: overrides.isInfluencer ?? false,
  };
  // Merge optional P1 fields only when the caller actually set them, so back-
  // compat test cases that leave them undefined don't get a sneaky default.
  if ("confidence" in overrides) base.confidence = overrides.confidence;
  if ("matchReason" in overrides) base.matchReason = overrides.matchReason;
  if ("normalizedUrl" in overrides) {
    base.normalizedUrl = overrides.normalizedUrl;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let harness: Harness;

beforeEach(async () => {
  harness = await setupHarness();
});

afterEach(async () => {
  await teardown(harness);
});

test("append fills normalizedUrl on write when adapter didn't set it", () => {
  const { InMemoryMentionStore } = harness.memoryStores;
  const store = new InMemoryMentionStore();
  store.append(
    mkMention({
      id: "hn-1",
      url: "https://github.com/vercel/next.js/?utm_source=x",
    }),
  );
  const rows = store.listForRepo("vercel--next-js");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].normalizedUrl, "https://github.com/vercel/next.js");
});

test("append dedupes by normalizedUrl — trailing slash variant collapses", () => {
  const { InMemoryMentionStore } = harness.memoryStores;
  const store = new InMemoryMentionStore();

  store.append(
    mkMention({ id: "hn-1", url: "https://github.com/vercel/next.js" }),
  );
  store.append(
    mkMention({ id: "hn-2", url: "https://github.com/vercel/next.js/" }),
  );

  const rows = store.listForRepo("vercel--next-js");
  assert.equal(rows.length, 1, "trailing-slash variant should collapse");
});

test("append dedupes by normalizedUrl — utm params collapse", () => {
  const { InMemoryMentionStore } = harness.memoryStores;
  const store = new InMemoryMentionStore();

  store.append(
    mkMention({ id: "hn-1", url: "https://github.com/vercel/next.js" }),
  );
  store.append(
    mkMention({
      id: "hn-2",
      url: "https://github.com/vercel/next.js?utm_source=twitter",
    }),
  );
  store.append(
    mkMention({
      id: "reddit-9",
      platform: "reddit",
      url: "https://WWW.github.com/vercel/next.js/?ref=foo",
    }),
  );

  const rows = store.listForRepo("vercel--next-js");
  assert.equal(rows.length, 1, "utm/ref/www variants should collapse to one");
});

test("append keeps distinct URLs as separate rows", () => {
  const { InMemoryMentionStore } = harness.memoryStores;
  const store = new InMemoryMentionStore();

  store.append(
    mkMention({ id: "hn-1", url: "https://github.com/vercel/next.js" }),
  );
  store.append(
    mkMention({
      id: "hn-2",
      url: "https://github.com/vercel/next.js/issues/1234",
    }),
  );

  const rows = store.listForRepo("vercel--next-js");
  assert.equal(rows.length, 2);
});

test("append preserves id-based dedup for back-compat (same id → 1 row)", () => {
  const { InMemoryMentionStore } = harness.memoryStores;
  const store = new InMemoryMentionStore();

  // Same id, same url — must collapse to one (existing behavior preserved).
  store.append(
    mkMention({ id: "hn-1", url: "https://news.ycombinator.com/item?id=1" }),
  );
  store.append(
    mkMention({
      id: "hn-1",
      url: "https://news.ycombinator.com/item?id=1",
      engagement: 42,
    }),
  );

  const rows = store.listForRepo("vercel--next-js");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].engagement, 42, "later write should replace payload");
});

test("append honors adapter-set normalizedUrl without recomputing", () => {
  const { InMemoryMentionStore } = harness.memoryStores;
  const store = new InMemoryMentionStore();

  // Adapter explicitly set normalizedUrl to a sentinel — store must not
  // overwrite it. (Useful for platforms where the canonical form differs
  // from what `normalizeUrl` would produce from the raw url.)
  store.append(
    mkMention({
      id: "gh-1",
      url: "https://github.com/vercel/next.js/?utm_source=x",
      normalizedUrl: "custom://canonical/vercel/next.js",
    }),
  );

  const rows = store.listForRepo("vercel--next-js");
  assert.equal(rows[0].normalizedUrl, "custom://canonical/vercel/next.js");
});

test("append preserves old rows without normalizedUrl + confidence fields (id-based dedup only)", () => {
  const { InMemoryMentionStore } = harness.memoryStores;
  const store = new InMemoryMentionStore();

  // Simulate two rows whose urls are unparseable so both end up with the
  // same fallback normalizedUrl — they should collapse. Distinct ids prove
  // it's URL-based collapse, not id-based.
  store.append(
    mkMention({ id: "weird-1", url: "not-a-url" }),
  );
  store.append(
    mkMention({ id: "weird-2", url: "not-a-url" }),
  );

  const rows = store.listForRepo("vercel--next-js");
  assert.equal(rows.length, 1, "same fallback canonical form → collapsed");
});

test("different repos with same normalizedUrl do not collide", () => {
  const { InMemoryMentionStore } = harness.memoryStores;
  const store = new InMemoryMentionStore();

  store.append(
    mkMention({
      id: "hn-1",
      repoId: "vercel--next-js",
      url: "https://news.ycombinator.com/item?id=1",
    }),
  );
  store.append(
    mkMention({
      id: "hn-2",
      repoId: "facebook--react",
      url: "https://news.ycombinator.com/item?id=1",
    }),
  );

  assert.equal(store.listForRepo("vercel--next-js").length, 1);
  assert.equal(store.listForRepo("facebook--react").length, 1);
});

test("file-persistence round-trips new optional fields", async () => {
  const { InMemoryMentionStore } = harness.memoryStores;
  const store = new InMemoryMentionStore();

  store.append(
    mkMention({
      id: "hn-1",
      url: "https://github.com/vercel/next.js",
      confidence: 1.0,
      matchReason: "exact_url",
      // normalizedUrl filled by append()
    }),
  );
  store.append(
    mkMention({
      id: "hn-2",
      url: "https://github.com/vercel/next.js/issues/1",
      confidence: 0.7,
      matchReason: "owner_name",
    }),
  );

  await store.persist();

  const hydrated = new InMemoryMentionStore();
  await hydrated.hydrate();

  const rows = hydrated.listForRepo("vercel--next-js");
  assert.equal(rows.length, 2);
  // Newest-first sort is by postedAt; both mocks use the same postedAt so
  // tie-break order isn't guaranteed — match by id.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const r1 = byId.get("hn-1")!;
  const r2 = byId.get("hn-2")!;
  assert.equal(r1.confidence, 1.0);
  assert.equal(r1.matchReason, "exact_url");
  assert.equal(r1.normalizedUrl, "https://github.com/vercel/next.js");
  assert.equal(r2.confidence, 0.7);
  assert.equal(r2.matchReason, "owner_name");
  assert.equal(
    r2.normalizedUrl,
    "https://github.com/vercel/next.js/issues/1",
  );
});

test("hydrate backfills normalizedUrl on rows that predate the field", async () => {
  const { InMemoryMentionStore } = harness.memoryStores;
  const { FILES, writeJsonlFile } = (await import(
    `../storage/file-persistence.ts?t=${Date.now()}-${Math.random()}`
  )) as typeof import("../storage/file-persistence");

  // Write a legacy-shape row (no normalizedUrl, no confidence) directly to
  // the JSONL — simulating data that was persisted before this patch.
  const legacyMention = {
    id: "legacy-1",
    repoId: "vercel--next-js",
    platform: "reddit",
    author: "bob",
    authorFollowers: null,
    content: "...",
    url: "https://github.com/vercel/next.js/?utm_source=x",
    sentiment: "neutral",
    engagement: 0,
    reach: 0,
    postedAt: "2026-04-19T00:00:00.000Z",
    discoveredAt: "2026-04-19T00:10:00.000Z",
    isInfluencer: false,
  } as const;
  await writeJsonlFile(FILES.mentions, [legacyMention]);

  const store = new InMemoryMentionStore();
  await store.hydrate();
  const rows = store.listForRepo("vercel--next-js");
  assert.equal(rows.length, 1);
  assert.equal(
    rows[0].normalizedUrl,
    "https://github.com/vercel/next.js",
    "hydrate should backfill normalizedUrl via append",
  );
});
