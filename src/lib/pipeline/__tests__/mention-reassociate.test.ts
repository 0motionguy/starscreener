// StarScreener Pipeline — `InMemoryMentionStore.reassociate` tests.
//
// Audit F8: when a tracked GitHub repo is renamed, mentions attributed to
// the OLD derived repoId would orphan under that key forever — they don't
// follow to the NEW repoId. `reassociate(oldRepoId, newRepoId)` is the
// surgical fix called from the ingest path right after `repoStore.upsert`.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { RepoMention } from "../types";

// ---------------------------------------------------------------------------
// Per-test harness — isolated temp DATA_DIR + fresh module instance so each
// test gets its own InMemoryMentionStore class without cross-talk.
// ---------------------------------------------------------------------------

interface Harness {
  dir: string;
  memoryStores: typeof import("../storage/memory-stores");
}

async function setupHarness(): Promise<Harness> {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "starscreener-reassoc-"),
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
// Test fixture — same shape as mention-dedup.test.ts to stay consistent.
// ---------------------------------------------------------------------------

function mkMention(
  overrides: Partial<RepoMention> & { id: string; url: string },
): RepoMention {
  const base: RepoMention = {
    id: overrides.id,
    repoId: overrides.repoId ?? "vercel--next",
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

test("reassociate moves all mentions from old repoId to new repoId", () => {
  const { InMemoryMentionStore } = harness.memoryStores;
  const store = new InMemoryMentionStore();

  // Three mentions under the OLD repoId.
  store.append(
    mkMention({
      id: "hn-1",
      repoId: "vercel--next",
      url: "https://news.ycombinator.com/item?id=1",
      postedAt: "2026-04-20T03:00:00.000Z",
    }),
  );
  store.append(
    mkMention({
      id: "hn-2",
      repoId: "vercel--next",
      url: "https://news.ycombinator.com/item?id=2",
      postedAt: "2026-04-20T02:00:00.000Z",
    }),
  );
  store.append(
    mkMention({
      id: "reddit-1",
      repoId: "vercel--next",
      platform: "reddit",
      url: "https://www.reddit.com/r/x/comments/1",
      postedAt: "2026-04-20T01:00:00.000Z",
    }),
  );

  store.reassociate("vercel--next", "vercel--next-js");

  // Old key empty, new key has all three, sorted newest-first.
  assert.equal(store.listForRepo("vercel--next").length, 0);
  const moved = store.listForRepo("vercel--next-js");
  assert.equal(moved.length, 3);
  assert.deepEqual(
    moved.map((m) => m.id),
    ["hn-1", "hn-2", "reddit-1"],
  );
  for (const m of moved) {
    assert.equal(m.repoId, "vercel--next-js", "repoId should be rewritten");
  }
});

test("reassociate merges into an existing newRepoId, deduping by id (incoming wins)", () => {
  const { InMemoryMentionStore } = harness.memoryStores;
  const store = new InMemoryMentionStore();

  // Two mentions already under the NEW key (e.g. ingest already wrote some
  // before the rename was detected, or the new id was used in a parallel run).
  store.append(
    mkMention({
      id: "hn-existing",
      repoId: "vercel--next-js",
      url: "https://news.ycombinator.com/item?id=existing",
      postedAt: "2026-04-20T05:00:00.000Z",
    }),
  );
  store.append(
    mkMention({
      id: "shared",
      repoId: "vercel--next-js",
      url: "https://news.ycombinator.com/item?id=shared",
      postedAt: "2026-04-20T04:00:00.000Z",
      engagement: 1, // older payload — incoming should win on collision
    }),
  );

  // Two mentions under the OLD key, one of which has the same id as one
  // already under NEW (collision case).
  store.append(
    mkMention({
      id: "hn-old",
      repoId: "vercel--next",
      url: "https://news.ycombinator.com/item?id=old",
      postedAt: "2026-04-20T06:00:00.000Z",
    }),
  );
  store.append(
    mkMention({
      id: "shared",
      repoId: "vercel--next",
      url: "https://news.ycombinator.com/item?id=shared",
      postedAt: "2026-04-20T04:00:00.000Z",
      engagement: 99, // newer payload — must win
    }),
  );

  store.reassociate("vercel--next", "vercel--next-js");

  assert.equal(store.listForRepo("vercel--next").length, 0);
  const merged = store.listForRepo("vercel--next-js");
  // Three rows: hn-existing (kept), hn-old (moved), shared (incoming wins).
  assert.equal(merged.length, 3, "no duplicate ids after merge");
  // Newest-first sort preserved across the merge.
  assert.deepEqual(
    merged.map((m) => m.id),
    ["hn-old", "hn-existing", "shared"],
  );
  // Incoming row's payload wins on the colliding id.
  const shared = merged.find((m) => m.id === "shared")!;
  assert.equal(shared.engagement, 99, "incoming row should win on id collision");
  assert.equal(shared.repoId, "vercel--next-js");
});

test("reassociate is a no-op when oldRepoId === newRepoId", () => {
  const { InMemoryMentionStore } = harness.memoryStores;
  const store = new InMemoryMentionStore();

  store.append(
    mkMention({
      id: "hn-1",
      repoId: "vercel--next-js",
      url: "https://news.ycombinator.com/item?id=1",
    }),
  );

  store.reassociate("vercel--next-js", "vercel--next-js");

  const rows = store.listForRepo("vercel--next-js");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "hn-1");
  assert.equal(rows[0].repoId, "vercel--next-js");
});

test("reassociate is a no-op when oldRepoId has no mentions", () => {
  const { InMemoryMentionStore } = harness.memoryStores;
  const store = new InMemoryMentionStore();

  // Pre-existing rows under newRepoId only — must remain untouched.
  store.append(
    mkMention({
      id: "hn-existing",
      repoId: "vercel--next-js",
      url: "https://news.ycombinator.com/item?id=existing",
    }),
  );

  store.reassociate("ghost--repo", "vercel--next-js");

  const rows = store.listForRepo("vercel--next-js");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "hn-existing");
  assert.equal(store.listForRepo("ghost--repo").length, 0);
});
