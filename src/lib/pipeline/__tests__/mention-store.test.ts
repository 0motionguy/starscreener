// StarScreener Pipeline — append-only mention-store persistence tests.
//
// Verifies the F-DATA-social-persist Phase 2 invariants:
//   - dedupe by (source, url) — both within a single batch and across calls
//   - persistence kill-switch (STARSCREENER_PERSIST=false) skips writes
//   - corrupted JSONL lines are skipped, surviving rows still load
//   - mention-store + InMemoryMentionStore.hydrate stay shape-compatible
//
// Each test mints a fresh DATA_DIR via mkdtemp + STARSCREENER_DATA_DIR so
// concurrent runs don't trample each other and so file-persistence's
// `currentDataDir()` re-reads the env per call.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { RepoMention } from "../types";

interface Harness {
  dir: string;
  mentionStore: typeof import("../storage/mention-store");
  filePersistence: typeof import("../storage/file-persistence");
  memoryStores: typeof import("../storage/memory-stores");
}

async function setupHarness(): Promise<Harness> {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "starscreener-mstore-"),
  );
  process.env.STARSCREENER_DATA_DIR = dir;
  delete process.env.STARSCREENER_PERSIST;

  const bust = `${Date.now()}-${Math.random()}`;
  const filePersistenceUrl = new URL(
    `../storage/file-persistence.ts?t=${bust}`,
    import.meta.url,
  );
  const mentionStoreUrl = new URL(
    `../storage/mention-store.ts?t=${bust}`,
    import.meta.url,
  );
  const memoryStoresUrl = new URL(
    `../storage/memory-stores.ts?t=${bust}`,
    import.meta.url,
  );
  const filePersistence = (await import(
    filePersistenceUrl.href,
  )) as Harness["filePersistence"];
  const mentionStore = (await import(
    mentionStoreUrl.href,
  )) as Harness["mentionStore"];
  const memoryStores = (await import(
    memoryStoresUrl.href,
  )) as Harness["memoryStores"];

  return { dir, filePersistence, mentionStore, memoryStores };
}

async function teardown(h: Harness): Promise<void> {
  await fs.rm(h.dir, { recursive: true, force: true });
  delete process.env.STARSCREENER_DATA_DIR;
  delete process.env.STARSCREENER_PERSIST;
}

function mkMention(
  overrides: Partial<RepoMention> & {
    id: string;
    url: string;
    platform?: RepoMention["platform"];
  },
): RepoMention {
  return {
    id: overrides.id,
    repoId: overrides.repoId ?? "vercel--next-js",
    platform: overrides.platform ?? "hackernews",
    author: overrides.author ?? "alice",
    authorFollowers: overrides.authorFollowers ?? null,
    content: overrides.content ?? "neat",
    url: overrides.url,
    sentiment: overrides.sentiment ?? "neutral",
    engagement: overrides.engagement ?? 0,
    reach: overrides.reach ?? 0,
    postedAt: overrides.postedAt ?? "2026-04-20T00:00:00.000Z",
    discoveredAt: overrides.discoveredAt ?? "2026-04-20T00:10:00.000Z",
    isInfluencer: overrides.isInfluencer ?? false,
  };
}

let harness: Harness;

beforeEach(async () => {
  harness = await setupHarness();
});

afterEach(async () => {
  await teardown(harness);
});

// ---------------------------------------------------------------------------
// Dedup tests
// ---------------------------------------------------------------------------

test("appendMentionsToFile dedupes by (source, url) within one batch", async () => {
  const res = await harness.mentionStore.appendMentionsToFile([
    mkMention({ id: "hn-1", url: "https://github.com/vercel/next.js" }),
    // Same source + URL → duplicate
    mkMention({ id: "hn-2", url: "https://github.com/vercel/next.js" }),
    // Same URL but different platform → distinct row
    mkMention({
      id: "rd-1",
      platform: "reddit",
      url: "https://github.com/vercel/next.js",
    }),
  ]);

  assert.equal(res.attempted, 3);
  assert.equal(res.appended, 2);
  assert.equal(res.duplicates, 1);

  const onDisk = await harness.mentionStore.readPersistedMentions();
  assert.equal(onDisk.length, 2);
  const byPlatform = new Set(onDisk.map((m) => m.platform));
  assert.ok(byPlatform.has("hackernews"));
  assert.ok(byPlatform.has("reddit"));
});

test("appendMentionsToFile dedupes by (source, url) across calls", async () => {
  await harness.mentionStore.appendMentionsToFile([
    mkMention({ id: "hn-1", url: "https://github.com/vercel/next.js" }),
  ]);
  const res = await harness.mentionStore.appendMentionsToFile([
    mkMention({
      id: "hn-2",
      url: "https://github.com/vercel/next.js?utm_source=x",
    }),
  ]);

  // utm tracking-param should normalize to the same canonical URL → dup.
  assert.equal(res.appended, 0, "tracking-param variant should dedupe");
  assert.equal(res.duplicates, 1);

  const onDisk = await harness.mentionStore.readPersistedMentions();
  assert.equal(onDisk.length, 1);
});

test("appendMentionsToFile keeps distinct URLs as separate rows", async () => {
  const res = await harness.mentionStore.appendMentionsToFile([
    mkMention({ id: "hn-1", url: "https://github.com/vercel/next.js" }),
    mkMention({
      id: "hn-2",
      url: "https://github.com/vercel/next.js/issues/1",
    }),
  ]);
  assert.equal(res.appended, 2);
  assert.equal(res.duplicates, 0);
});

test("appendMentionsToFile fills normalizedUrl on the persisted record", async () => {
  await harness.mentionStore.appendMentionsToFile([
    mkMention({
      id: "hn-1",
      url: "https://github.com/vercel/next.js/?utm_source=newsletter",
    }),
  ]);
  const onDisk = await harness.mentionStore.readPersistedMentions();
  assert.equal(onDisk.length, 1);
  assert.equal(
    onDisk[0].normalizedUrl,
    "https://github.com/vercel/next.js",
  );
});

// ---------------------------------------------------------------------------
// Kill-switch
// ---------------------------------------------------------------------------

test("appendMentionsToFile is a no-op when STARSCREENER_PERSIST=false", async () => {
  process.env.STARSCREENER_PERSIST = "false";
  const res = await harness.mentionStore.appendMentionsToFile([
    mkMention({ id: "hn-1", url: "https://github.com/vercel/next.js" }),
  ]);
  assert.equal(res.appended, 0);
  assert.equal(res.duplicates, 0);

  // The file should not have been created.
  const filePath = path.join(harness.dir, harness.filePersistence.FILES.mentions);
  await assert.rejects(
    () => fs.stat(filePath),
    (err: NodeJS.ErrnoException) => err.code === "ENOENT",
    "file must not exist when persistence is disabled",
  );
});

test("readPersistedMentions returns [] when persistence is disabled", async () => {
  process.env.STARSCREENER_PERSIST = "false";
  const out = await harness.mentionStore.readPersistedMentions();
  assert.deepEqual(out, []);
});

// ---------------------------------------------------------------------------
// Empty / corrupted file handling
// ---------------------------------------------------------------------------

test("readPersistedMentions returns [] when no file exists", async () => {
  const out = await harness.mentionStore.readPersistedMentions();
  assert.deepEqual(out, []);
});

test("readPersistedMentions skips corrupted lines and keeps valid ones", async () => {
  const filePath = path.join(harness.dir, harness.filePersistence.FILES.mentions);
  const valid = mkMention({ id: "hn-1", url: "https://github.com/vercel/next.js" });
  const lines = [
    JSON.stringify(valid),
    "this is not json",
    JSON.stringify(
      mkMention({
        id: "hn-2",
        url: "https://github.com/vercel/next.js/issues/9",
      }),
    ),
    "{broken",
  ];
  await fs.writeFile(filePath, lines.join("\n") + "\n", "utf8");

  const rows = await harness.mentionStore.readPersistedMentions();
  assert.equal(rows.length, 2, "two valid rows should survive");
  const ids = new Set(rows.map((r) => r.id));
  assert.ok(ids.has("hn-1"));
  assert.ok(ids.has("hn-2"));
});

test("appendMentionsToFile after a corrupted line still preserves dedup invariants", async () => {
  const filePath = path.join(harness.dir, harness.filePersistence.FILES.mentions);
  const existing = mkMention({
    id: "hn-1",
    url: "https://github.com/vercel/next.js",
    normalizedUrl: "https://github.com/vercel/next.js",
  });
  await fs.writeFile(
    filePath,
    JSON.stringify(existing) + "\n" + "garbage\n",
    "utf8",
  );

  // The same (source, url) — must be deduped against the surviving row.
  const res = await harness.mentionStore.appendMentionsToFile([
    mkMention({ id: "hn-2", url: "https://github.com/vercel/next.js" }),
  ]);
  assert.equal(res.appended, 0);
  assert.equal(res.duplicates, 1);
});

// ---------------------------------------------------------------------------
// Group-by and active-sources helpers
// ---------------------------------------------------------------------------

test("groupMentionsByRepo buckets by repoId", () => {
  const ms = [
    mkMention({ id: "a", url: "u/1", repoId: "alpha" }),
    mkMention({ id: "b", url: "u/2", repoId: "alpha" }),
    mkMention({ id: "c", url: "u/3", repoId: "beta" }),
  ];
  const out = harness.mentionStore.groupMentionsByRepo(ms);
  assert.equal(out.size, 2);
  assert.equal(out.get("alpha")?.length, 2);
  assert.equal(out.get("beta")?.length, 1);
});

test("activeSources returns distinct platforms in stable order", () => {
  const ms = [
    mkMention({ id: "1", url: "u/1", platform: "hackernews" }),
    mkMention({ id: "2", url: "u/2", platform: "reddit" }),
    mkMention({ id: "3", url: "u/3", platform: "hackernews" }),
    mkMention({ id: "4", url: "u/4", platform: "bluesky" }),
  ];
  const out = harness.mentionStore.activeSources(ms);
  assert.equal(out.length, 3);
  assert.ok(out.includes("hackernews"));
  assert.ok(out.includes("reddit"));
  assert.ok(out.includes("bluesky"));
});

// ---------------------------------------------------------------------------
// Cross-store compat
// ---------------------------------------------------------------------------

test("InMemoryMentionStore.hydrate replays the file written by appendMentionsToFile", async () => {
  const m1 = mkMention({
    id: "hn-1",
    url: "https://github.com/vercel/next.js",
  });
  const m2 = mkMention({
    id: "hn-2",
    url: "https://github.com/vercel/next.js/issues/9",
    repoId: "vercel--next-js",
  });
  await harness.mentionStore.appendMentionsToFile([m1, m2]);

  const store = new harness.memoryStores.InMemoryMentionStore();
  await store.hydrate();
  const rows = store.listForRepo("vercel--next-js");
  assert.equal(rows.length, 2);
  // Both rows survive id-based dedup; normalizedUrl must be present after hydrate.
  for (const r of rows) {
    assert.ok(typeof r.normalizedUrl === "string" && r.normalizedUrl.length > 0);
  }
});
