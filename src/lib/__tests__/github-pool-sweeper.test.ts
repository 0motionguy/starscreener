// StarScreener — github-pool-sweeper tests.
//
// Pure planner coverage (no Redis):
//   1. Empty input → empty plan
//   2. Malformed JSON → expire with reason="malformed"
//   3. Missing tokenLabel → expire (malformed shape)
//   4. Quarantine in the past beyond grace → expire
//   5. Quarantine just-elapsed within grace → keep
//   6. Quarantine in the future → keep
//   7. Remaining=0 AND reset stale beyond grace → expire
//   8. Remaining=0 AND reset within grace → keep
//   9. Healthy entry (remaining>0, no quarantine) → keep
//
// runSweep shell coverage (injected mock client):
//   10. End-to-end: scans, parses, deletes expired keys, returns counts
//   11. dryRun: plan only, no DEL
//   12. ioredis init failure (no REDIS_URL) → errors surfaced, no crash
//
// Run with:
//   npx tsx --test src/lib/__tests__/github-pool-sweeper.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GH_POOL_KEY_PREFIX,
  QUARANTINE_DECAY_GRACE_MS,
  RESET_DECAY_GRACE_MS,
  parseTokenState,
  planSweep,
  runSweep,
  type PoolEntry,
  type PublishedTokenState,
  type SweeperRedisClient,
} from "../github-pool-sweeper";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePayload(overrides: Partial<PublishedTokenState> = {}): string {
  const base: PublishedTokenState = {
    tokenLabel: "ghp_...abcd",
    remaining: 4900,
    resetUnixSec: Math.floor(Date.now() / 1000) + 600,
    lastObservedMs: Date.now(),
    quarantinedUntilMs: null,
    lambdaId: "worker:42",
    writtenAt: new Date().toISOString(),
  };
  return JSON.stringify({ ...base, ...overrides });
}

function entry(key: string, raw: string | null): PoolEntry {
  return { key, rawPayload: raw };
}

const NOW = 1_750_000_000_000; // fixed wall clock for determinism

// ---------------------------------------------------------------------------
// parseTokenState
// ---------------------------------------------------------------------------

test("parseTokenState rejects null / non-JSON", () => {
  assert.equal(parseTokenState(null), null);
  assert.equal(parseTokenState(""), null);
  assert.equal(parseTokenState("not-json"), null);
});

test("parseTokenState rejects object missing tokenLabel", () => {
  assert.equal(parseTokenState(JSON.stringify({ remaining: 10 })), null);
});

test("parseTokenState coerces non-finite numbers to null", () => {
  const raw = JSON.stringify({
    tokenLabel: "ghp_...zzzz",
    remaining: "not-a-number",
    resetUnixSec: NaN,
    quarantinedUntilMs: null,
  });
  const parsed = parseTokenState(raw);
  assert.ok(parsed);
  assert.equal(parsed?.remaining, null);
  assert.equal(parsed?.resetUnixSec, null);
});

// ---------------------------------------------------------------------------
// planSweep — empty / malformed input
// ---------------------------------------------------------------------------

test("planSweep — empty input returns empty plan", () => {
  const plan = planSweep([], NOW);
  assert.deepEqual(plan, { scanned: 0, toExpire: [], toKeep: [] });
});

test("planSweep — malformed payload is expired with reason=malformed", () => {
  const plan = planSweep(
    [entry(`${GH_POOL_KEY_PREFIX}foo`, "{not-json")],
    NOW,
  );
  assert.equal(plan.toExpire.length, 1);
  assert.equal(plan.toExpire[0]?.reason, "malformed");
  assert.equal(plan.toKeep.length, 0);
});

test("planSweep — missing tokenLabel is treated as malformed", () => {
  const raw = JSON.stringify({ remaining: 100 });
  const plan = planSweep(
    [entry(`${GH_POOL_KEY_PREFIX}foo`, raw)],
    NOW,
  );
  assert.equal(plan.toExpire[0]?.reason, "malformed");
});

// ---------------------------------------------------------------------------
// planSweep — quarantine criterion
// ---------------------------------------------------------------------------

test("planSweep — quarantine expired far in the past beyond grace → expire", () => {
  const raw = makePayload({
    quarantinedUntilMs: NOW - QUARANTINE_DECAY_GRACE_MS - 60_000, // 1 min past grace
  });
  const plan = planSweep([entry(`${GH_POOL_KEY_PREFIX}foo`, raw)], NOW);
  assert.equal(plan.toExpire[0]?.reason, "quarantine-expired");
});

test("planSweep — quarantine recently expired (within grace) → keep", () => {
  const raw = makePayload({
    quarantinedUntilMs: NOW - QUARANTINE_DECAY_GRACE_MS + 60_000, // 1 min INSIDE grace
  });
  const plan = planSweep([entry(`${GH_POOL_KEY_PREFIX}foo`, raw)], NOW);
  assert.equal(plan.toKeep.length, 1);
  assert.equal(plan.toExpire.length, 0);
});

test("planSweep — quarantine still active (future) → keep", () => {
  const raw = makePayload({ quarantinedUntilMs: NOW + 3_600_000 });
  const plan = planSweep([entry(`${GH_POOL_KEY_PREFIX}foo`, raw)], NOW);
  assert.equal(plan.toKeep.length, 1);
});

// ---------------------------------------------------------------------------
// planSweep — exhausted + reset-stale criterion
// ---------------------------------------------------------------------------

test("planSweep — remaining=0 + reset stale beyond grace → expire", () => {
  const stale = NOW - RESET_DECAY_GRACE_MS - 60_000;
  const raw = makePayload({
    remaining: 0,
    resetUnixSec: Math.floor(stale / 1000),
  });
  const plan = planSweep([entry(`${GH_POOL_KEY_PREFIX}foo`, raw)], NOW);
  assert.equal(plan.toExpire[0]?.reason, "reset-stale-and-exhausted");
});

test("planSweep — remaining=0 but reset within grace → keep", () => {
  const recent = NOW - RESET_DECAY_GRACE_MS + 60_000;
  const raw = makePayload({
    remaining: 0,
    resetUnixSec: Math.floor(recent / 1000),
  });
  const plan = planSweep([entry(`${GH_POOL_KEY_PREFIX}foo`, raw)], NOW);
  assert.equal(plan.toKeep.length, 1);
});

test("planSweep — remaining>0 always kept regardless of reset window", () => {
  const veryOld = NOW - 7 * 24 * 60 * 60 * 1000;
  const raw = makePayload({
    remaining: 4900,
    resetUnixSec: Math.floor(veryOld / 1000),
  });
  const plan = planSweep([entry(`${GH_POOL_KEY_PREFIX}foo`, raw)], NOW);
  assert.equal(plan.toKeep.length, 1);
});

test("planSweep — healthy entry (positive remaining, no quarantine) → keep", () => {
  const raw = makePayload({
    remaining: 4500,
    resetUnixSec: Math.floor(NOW / 1000) + 1200,
    quarantinedUntilMs: null,
  });
  const plan = planSweep([entry(`${GH_POOL_KEY_PREFIX}foo`, raw)], NOW);
  assert.equal(plan.toKeep.length, 1);
  assert.equal(plan.toKeep[0]?.state.tokenLabel, "ghp_...abcd");
});

test("planSweep — mixed batch routes each entry independently", () => {
  const healthy = makePayload({ remaining: 4500 });
  const malformed = "{garbage";
  const oldQuarantine = makePayload({
    quarantinedUntilMs: NOW - QUARANTINE_DECAY_GRACE_MS - 1,
  });
  const plan = planSweep(
    [
      entry(`${GH_POOL_KEY_PREFIX}a`, healthy),
      entry(`${GH_POOL_KEY_PREFIX}b`, malformed),
      entry(`${GH_POOL_KEY_PREFIX}c`, oldQuarantine),
    ],
    NOW,
  );
  assert.equal(plan.scanned, 3);
  assert.equal(plan.toKeep.length, 1);
  assert.equal(plan.toExpire.length, 2);
  const reasons = plan.toExpire.map((e) => e.reason).sort();
  assert.deepEqual(reasons, ["malformed", "quarantine-expired"]);
});

// ---------------------------------------------------------------------------
// runSweep — impure shell with injected client
// ---------------------------------------------------------------------------

function makeMockClient(
  store: Map<string, string>,
  opts: { failKeys?: boolean; failDel?: boolean } = {},
): SweeperRedisClient & { deletedKeys: string[] } {
  const deletedKeys: string[] = [];
  return {
    async keys(pattern: string): Promise<string[]> {
      if (opts.failKeys) throw new Error("KEYS unavailable");
      const prefix = pattern.replace(/\*$/, "");
      return [...store.keys()].filter((k) => k.startsWith(prefix));
    },
    async mget(keys: string[]): Promise<Array<string | null>> {
      return keys.map((k) => store.get(k) ?? null);
    },
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async del(...keys: string[]): Promise<number> {
      if (opts.failDel) throw new Error("DEL unavailable");
      let n = 0;
      for (const k of keys) {
        if (store.delete(k)) n++;
        deletedKeys.push(k);
      }
      return n;
    },
    deletedKeys,
  };
}

test("runSweep — end-to-end with mock client", async () => {
  const store = new Map<string, string>();
  store.set(`${GH_POOL_KEY_PREFIX}healthy`, makePayload({ remaining: 4500 }));
  store.set(`${GH_POOL_KEY_PREFIX}stale`, makePayload({
    quarantinedUntilMs: NOW - QUARANTINE_DECAY_GRACE_MS - 1,
  }));
  store.set(`${GH_POOL_KEY_PREFIX}garbage`, "not-json");
  const client = makeMockClient(store);
  const result = await runSweep({
    redisClient: client,
    now: () => NOW,
    env: { REDIS_URL: "redis://test" },
  });
  assert.equal(result.plan.scanned, 3);
  assert.equal(result.plan.toExpire.length, 2);
  assert.equal(result.plan.toKeep.length, 1);
  assert.equal(result.deleted, 2);
  // Healthy key not deleted from the backing store.
  assert.ok(store.has(`${GH_POOL_KEY_PREFIX}healthy`));
  assert.ok(!store.has(`${GH_POOL_KEY_PREFIX}stale`));
  assert.ok(!store.has(`${GH_POOL_KEY_PREFIX}garbage`));
  assert.equal(result.errors.length, 0);
});

test("runSweep — dryRun returns plan but does not delete", async () => {
  const store = new Map<string, string>();
  store.set(`${GH_POOL_KEY_PREFIX}stale`, makePayload({
    quarantinedUntilMs: NOW - QUARANTINE_DECAY_GRACE_MS - 1,
  }));
  const client = makeMockClient(store);
  const result = await runSweep({
    redisClient: client,
    now: () => NOW,
    env: { REDIS_URL: "redis://test" },
    dryRun: true,
  });
  assert.equal(result.plan.toExpire.length, 1);
  assert.equal(result.deleted, 0);
  assert.ok(store.has(`${GH_POOL_KEY_PREFIX}stale`));
});

test("runSweep — no REDIS_URL + no injected client → graceful no-op with error", async () => {
  const result = await runSweep({
    env: {}, // no REDIS_URL
    now: () => NOW,
  });
  assert.equal(result.deleted, 0);
  assert.equal(result.plan.scanned, 0);
  assert.ok(result.errors.length > 0);
});

test("runSweep — KEYS failure surfaces in errors, no crash", async () => {
  const client = makeMockClient(new Map(), { failKeys: true });
  const result = await runSweep({
    redisClient: client,
    now: () => NOW,
    env: { REDIS_URL: "redis://test" },
  });
  assert.equal(result.deleted, 0);
  assert.ok(result.errors.some((e) => e.includes("keys failed")));
});

test("runSweep — DEL failure surfaces in errors but plan is still returned", async () => {
  const store = new Map<string, string>();
  store.set(`${GH_POOL_KEY_PREFIX}stale`, makePayload({
    quarantinedUntilMs: NOW - QUARANTINE_DECAY_GRACE_MS - 1,
  }));
  const client = makeMockClient(store, { failDel: true });
  const result = await runSweep({
    redisClient: client,
    now: () => NOW,
    env: { REDIS_URL: "redis://test" },
  });
  assert.equal(result.plan.toExpire.length, 1);
  assert.ok(result.errors.some((e) => e.includes("del failed")));
});
