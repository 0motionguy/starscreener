// Mentions ledger reader — unit tests.
//
// Verifies the refresh-then-get contract from src/lib/mentions-ledger.ts:
//   1. refresh() populates the cache from a healthy data-store payload.
//   2. Repeat calls inside the 30 s window do NOT re-hit the store.
//   3. Concurrent calls dedupe via the in-flight promise.
//   4. Total store miss leaves the cache as an empty Map (graceful
//      degradation — A7 decorator falls back to legacy windowed counts).
//   5. Paused sources are stripped before the cache is exposed.
//   6. `sources` array is sorted descending by per-source count so UI
//      consumers can render pips in canonical order without re-sorting.
//
// The data-store is injected as a fake via the optional `store` parameter,
// matching the test-injection style used by `readDataStoreWithFreshness` in
// src/lib/data-store.ts. No Redis, no SDK, no network.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  _resetMentionsLedgerCacheForTests,
  getMentionsLedger,
  getRepoMentionsLedger,
  refreshMentionsLedgerFromStore,
  type MentionsLedgerSnapshot,
} from "../mentions-ledger";
import type { DataReadResult, DataStore, RedisClientLike } from "../data-store";

// ---------------------------------------------------------------------------
// Fake data-store
// ---------------------------------------------------------------------------

class FakeStore implements DataStore {
  public calls = 0;
  /** When set, the next read() returns this payload as a Redis hit. */
  public next: MentionsLedgerSnapshot | null = null;
  /** When true, the next read() simulates a total miss across every tier. */
  public miss = false;

  async read<T>(key: string): Promise<DataReadResult<T>> {
    this.calls += 1;
    void key;
    if (this.miss) {
      return { data: null, source: "missing", ageMs: 0, fresh: false };
    }
    if (this.next) {
      return {
        data: this.next as unknown as T,
        source: "redis",
        ageMs: 0,
        fresh: true,
        writtenAt: new Date().toISOString(),
      };
    }
    return { data: null, source: "missing", ageMs: 0, fresh: false };
  }

  async readMany<T>(keys: string[]): Promise<DataReadResult<T>[]> {
    return Promise.all(keys.map(() => this.read<T>("")));
  }

  async write(): Promise<void> {
    /* not exercised */
  }

  async writtenAt(): Promise<string | null> {
    return null;
  }

  async reset(): Promise<void> {
    /* not exercised */
  }

  redisClient(): RedisClientLike | null {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fixtureSnapshot(): MentionsLedgerSnapshot {
  return {
    writtenAt: "2026-05-21T12:00:00.000Z",
    entries: [
      {
        fullName: "vercel/next.js",
        perSource: {
          hackernews: 1284,
          reddit: 432,
          bluesky: 78,
        },
        total: 1794,
        // Intentionally pre-mis-ordered so the test proves the cache sorts.
        sources: ["bluesky", "hackernews", "reddit"],
      },
      {
        fullName: "HKUDS/AI-Trader",
        perSource: { hackernews: 40, lobsters: 15, devto: 10 },
        total: 65,
        sources: [],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  _resetMentionsLedgerCacheForTests();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("refresh: populates cache from a healthy data-store payload", async () => {
  const fake = new FakeStore();
  fake.next = fixtureSnapshot();

  await refreshMentionsLedgerFromStore(fake);

  assert.equal(fake.calls, 1, "store should be hit exactly once");
  const entry = getRepoMentionsLedger("vercel/next.js");
  assert.ok(entry, "vercel/next.js should be present in the cache");
  assert.equal(entry!.total, 1362);
  assert.equal(entry!.perSource.hackernews, 1284);
  assert.equal(entry!.perSource.reddit, undefined);
});

test("refresh: subsequent calls within 30 s do NOT re-hit the store", async () => {
  const fake = new FakeStore();
  fake.next = fixtureSnapshot();

  await refreshMentionsLedgerFromStore(fake);
  assert.equal(fake.calls, 1);

  // Three more refresh calls back-to-back — rate-limited window, nothing flows.
  await refreshMentionsLedgerFromStore(fake);
  await refreshMentionsLedgerFromStore(fake);
  await refreshMentionsLedgerFromStore(fake);
  assert.equal(fake.calls, 1, "rate-limit must suppress repeat fetches");
});

test("refresh: concurrent callers dedupe via the in-flight promise", async () => {
  const fake = new FakeStore();
  fake.next = fixtureSnapshot();

  const results = await Promise.all([
    refreshMentionsLedgerFromStore(fake),
    refreshMentionsLedgerFromStore(fake),
    refreshMentionsLedgerFromStore(fake),
    refreshMentionsLedgerFromStore(fake),
  ]);

  assert.equal(results.length, 4);
  assert.equal(fake.calls, 1, "in-flight dedupe must collapse to a single fetch");
});

test("getRepoMentionsLedger: unknown repo returns null", async () => {
  const fake = new FakeStore();
  fake.next = fixtureSnapshot();
  await refreshMentionsLedgerFromStore(fake);

  assert.equal(getRepoMentionsLedger("not/here"), null);
  assert.equal(getRepoMentionsLedger(""), null);
});

test("getRepoMentionsLedger: lookup is case-insensitive on fullName", async () => {
  const fake = new FakeStore();
  fake.next = fixtureSnapshot();
  await refreshMentionsLedgerFromStore(fake);

  const lower = getRepoMentionsLedger("hkuds/ai-trader");
  const upper = getRepoMentionsLedger("HKUDS/AI-Trader");
  assert.ok(lower, "lower-case lookup should hit");
  assert.ok(upper, "original-case lookup should hit");
  assert.equal(lower!.total, 65);
  assert.equal(upper!.total, 65);
});

test("refresh: total store miss leaves cache as empty Map (graceful degradation)", async () => {
  const fake = new FakeStore();
  fake.miss = true;
  await refreshMentionsLedgerFromStore(fake);

  assert.equal(fake.calls, 1);
  assert.equal(getMentionsLedger().size, 0, "cache should remain empty on store miss");
  assert.equal(getRepoMentionsLedger("vercel/next.js"), null);
});

test("buildCache: sources array is sorted descending by per-source count", async () => {
  const fake = new FakeStore();
  fake.next = fixtureSnapshot();
  await refreshMentionsLedgerFromStore(fake);

  const next = getRepoMentionsLedger("vercel/next.js");
  assert.ok(next);
  assert.deepEqual(
    next!.sources,
    ["hackernews", "bluesky"],
    "sources must be rebuilt from active sources only and sorted descending by count",
  );

  const trader = getRepoMentionsLedger("HKUDS/AI-Trader");
  assert.ok(trader);
  assert.deepEqual(
    trader!.sources,
    ["hackernews", "lobsters", "devto"],
    "sources must be rebuilt from perSource even when the snapshot omits them",
  );
});

test("buildCache: strips paused Reddit counts and recomputes totals", async () => {
  const fake = new FakeStore();
  fake.next = fixtureSnapshot();
  await refreshMentionsLedgerFromStore(fake);

  const entry = getRepoMentionsLedger("vercel/next.js");
  assert.ok(entry);
  assert.equal(entry!.perSource.reddit, undefined);
  assert.equal(entry!.total, 1362);
  assert.deepEqual(entry!.sources, ["hackernews", "bluesky"]);
});
