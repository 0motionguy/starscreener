// ProductHunt reader — unit tests.
//
// Verifies the refresh-then-get contract from src/lib/producthunt.ts:
//   1. refresh() populates the launchesByRepo map from a healthy data-store
//      payload, and getLaunchForRepo() returns the highest-voted launch.
//   2. Repeat calls inside the 30 s window do NOT re-hit the store (memory
//      short-circuit; preserves Redis budget under page-render fan-out).
//   3. Unknown repo + null payload both degrade gracefully — null lookups
//      and empty getAllPhLaunches(), no throw.
//
// The data-store is injected as a fake via the optional `store` parameter
// (same test-injection style as src/lib/mentions-ledger.ts). No Redis, no
// network, no SDK.
//
// HISTORICAL NOTE (Wave-2 A6 mission, 2026-05-21): the assignment matrix
// claimed this reader didn't exist and asked us to CREATE it. Verification
// found `src/lib/producthunt.ts` already shipped with TOOLBOX-backed refresh,
// 30 s rate-limit, in-flight dedupe, and four production callers (og/top10,
// sidebar-source-counts, source-health, top10/live-payload). The honest
// deliverable became these tests — hardening what already shipped — plus a
// 1-line test-injection seam on `refreshProducthuntLaunchesFromStore` to
// mirror the project's standard reader-test pattern.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  _resetProducthuntCacheForTests,
  getAllPhLaunches,
  getLaunchForRepo,
  refreshProducthuntLaunchesFromStore,
  type Launch,
  type ProductHuntFile,
} from "../producthunt";
import type { DataReadResult, DataStore, RedisClientLike } from "../data-store";

// ---------------------------------------------------------------------------
// Fake data-store — only read() is exercised; the rest are no-ops to satisfy
// the DataStore interface contract.
// ---------------------------------------------------------------------------

class FakeStore implements DataStore {
  public calls = 0;
  /** When set, the next read() returns this payload as a Redis hit. */
  public next: ProductHuntFile | null = null;
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
    // Unused in reader tests.
  }

  async writtenAt(): Promise<string | null> {
    return null;
  }

  async reset(): Promise<void> {
    // Unused.
  }

  redisClient(): RedisClientLike | null {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fixture factory — minimum-shape launches keyed by linkedRepo.
// ---------------------------------------------------------------------------

function mkLaunch(overrides: Partial<Launch> = {}): Launch {
  return {
    id: "launch-1",
    name: "Test Launch",
    tagline: "an example",
    description: "",
    url: "https://producthunt.com/posts/test",
    website: null,
    votesCount: 100,
    commentsCount: 10,
    createdAt: "2026-05-20T12:00:00Z",
    thumbnail: null,
    topics: [],
    makers: [],
    githubUrl: null,
    linkedRepo: "acme/widget",
    daysSinceLaunch: 1,
    ...overrides,
  };
}

function mkFile(launches: Launch[]): ProductHuntFile {
  return {
    lastFetchedAt: "2026-05-20T12:30:00Z",
    windowDays: 7,
    launches,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  _resetProducthuntCacheForTests();
});

test("refresh populates launchesByRepo from a healthy data-store payload", async () => {
  const store = new FakeStore();
  store.next = mkFile([
    mkLaunch({ id: "a", linkedRepo: "acme/widget", votesCount: 50 }),
    // Second launch for the same repo with MORE votes — getLaunchForRepo
    // must surface the higher-voted one per buildLaunchesByRepo's contract.
    mkLaunch({ id: "b", linkedRepo: "acme/widget", votesCount: 250 }),
    mkLaunch({ id: "c", linkedRepo: "other/lib", votesCount: 75 }),
  ]);

  const result = await refreshProducthuntLaunchesFromStore(store);

  assert.equal(result.source, "redis");
  assert.equal(store.calls, 1);

  const all = getAllPhLaunches();
  assert.equal(all.length, 3, "getAllPhLaunches returns every launch as-stored");

  const widget = getLaunchForRepo("acme/widget");
  assert.ok(widget, "lookup finds the launch");
  assert.equal(widget!.id, "b", "highest-voted launch wins on collision");
  assert.equal(widget!.votesCount, 250);

  // Case-insensitive lookup — buildLaunchesByRepo lower-cases keys.
  const widgetUpper = getLaunchForRepo("ACME/Widget");
  assert.equal(widgetUpper?.id, "b", "lookup is case-insensitive");
});

test("repeat refresh within 30s does not re-hit the store", async () => {
  const store = new FakeStore();
  store.next = mkFile([mkLaunch()]);

  const first = await refreshProducthuntLaunchesFromStore(store);
  assert.equal(first.source, "redis");
  assert.equal(store.calls, 1);

  // Mutate the fake's next payload so a re-hit would visibly land a new
  // launch in the cache — the test then proves no re-hit happened.
  store.next = mkFile([
    mkLaunch({ id: "should-not-appear", linkedRepo: "rogue/repo" }),
  ]);

  const second = await refreshProducthuntLaunchesFromStore(store);
  assert.equal(second.source, "memory", "second call short-circuits to memory");
  assert.equal(store.calls, 1, "fake store still records exactly one read");
  assert.equal(
    getLaunchForRepo("rogue/repo"),
    null,
    "rogue payload never reached the cache",
  );
});

test("unknown repo and missing payload degrade gracefully", async () => {
  const store = new FakeStore();
  store.miss = true;

  const result = await refreshProducthuntLaunchesFromStore(store);
  // The reader stamps lastRefreshMs even on a miss to avoid hammering the
  // store with retries, so the returned `source` is whatever the data-store
  // surfaced — here, "missing".
  assert.equal(result.source, "missing");

  // Cache stays empty — no launches, no per-repo lookups land.
  assert.equal(getAllPhLaunches().length, 0);
  assert.equal(getLaunchForRepo("any/repo"), null);
  assert.equal(getLaunchForRepo(""), null, "empty fullName lookup returns null");

  // After a successful refresh, an unknown repo still returns null while
  // known repos resolve — proves the lookup contract is "known-only", not
  // "first launch".
  _resetProducthuntCacheForTests();
  const okStore = new FakeStore();
  okStore.next = mkFile([
    mkLaunch({ id: "known", linkedRepo: "known/repo", votesCount: 42 }),
  ]);
  await refreshProducthuntLaunchesFromStore(okStore);
  assert.equal(getLaunchForRepo("known/repo")?.id, "known");
  assert.equal(getLaunchForRepo("unknown/repo"), null);
});
