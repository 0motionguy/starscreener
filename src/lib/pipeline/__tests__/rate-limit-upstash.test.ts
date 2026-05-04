// StarScreener — Rate-limit tests (Upstash path).
//
// Exercises the UpstashRateLimitStore against a hand-rolled fake that
// mimics the subset of @upstash/redis we actually call:
//   pipeline().incr(key).expire(key, ttl, "NX").pttl(key).exec()
//   del(key)
//
// Also exercises the factory's selection logic — when both env vars are
// set, `createStore` wires up an UpstashRateLimitStore via an injected
// factory (no network / no real SDK), and the limiter behaves identically
// against the fake.

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import {
  _resetRateLimitForTests,
  _setStoreForTests,
  checkRateLimitAsync,
} from "../../api/rate-limit";
import {
  UpstashRateLimitStore,
  createStore,
  _resetFallbackWarningForTests,
  type UpstashPipelineLike,
  type UpstashRedisLike,
} from "../../api/rate-limit-store";
import { RateLimitRecoverableError } from "../../errors";

// ---------------------------------------------------------------------------
// Fake Upstash client
// ---------------------------------------------------------------------------

interface FakeEntry {
  count: number;
  /** Absolute ms. -1 means no TTL. */
  expiresAtMs: number;
}

class FakeRedis implements UpstashRedisLike {
  public keys = new Map<string, FakeEntry>();
  public execCalls = 0;
  /** Hook: when set, every `exec()` throws this error once then un-arms. */
  public failNextExecWith: Error | null = null;
  private now: () => number;

  constructor(nowFn: () => number = () => Date.now()) {
    this.now = nowFn;
  }

  private gc(key: string): void {
    const entry = this.keys.get(key);
    if (!entry) return;
    if (entry.expiresAtMs !== -1 && entry.expiresAtMs <= this.now()) {
      this.keys.delete(key);
    }
  }

  pipeline(): UpstashPipelineLike {
    const steps: Array<() => unknown> = [];
    const gc = (key: string) => this.gc(key);
    const getKeys = () => this.keys;
    const nowFn = () => this.now();
    const recordExec = () => {
      this.execCalls += 1;
    };
    const takeFailHook = (): Error | null => {
      const err = this.failNextExecWith;
      this.failNextExecWith = null;
      return err;
    };

    const p: UpstashPipelineLike = {
      incr(key: string) {
        steps.push(() => {
          gc(key);
          const keys = getKeys();
          const entry = keys.get(key);
          if (!entry) {
            const fresh: FakeEntry = { count: 1, expiresAtMs: -1 };
            keys.set(key, fresh);
            return 1;
          }
          entry.count += 1;
          return entry.count;
        });
        return p;
      },
      expire(key: string, seconds: number, option: "NX") {
        steps.push(() => {
          gc(key);
          const entry = getKeys().get(key);
          if (!entry) return 0;
          if (option === "NX" && entry.expiresAtMs !== -1) {
            // TTL already set — NX means "only if not set".
            return 0;
          }
          entry.expiresAtMs = nowFn() + seconds * 1000;
          return 1;
        });
        return p;
      },
      pttl(key: string) {
        steps.push(() => {
          gc(key);
          const entry = getKeys().get(key);
          if (!entry) return -2;
          if (entry.expiresAtMs === -1) return -1;
          return Math.max(0, entry.expiresAtMs - nowFn());
        });
        return p;
      },
      async exec() {
        recordExec();
        const err = takeFailHook();
        if (err) throw err;
        return steps.map((step) => step());
      },
    };
    return p;
  }

  async del(key: string): Promise<number> {
    const had = this.keys.delete(key);
    return had ? 1 : 0;
  }
}

function mkRequest(ip: string): Request {
  return new Request("https://example.test/route", {
    headers: { "x-forwarded-for": ip },
  });
}

beforeEach(() => {
  _resetRateLimitForTests();
  _setStoreForTests(null);
  _resetFallbackWarningForTests();
});

// ---------------------------------------------------------------------------
// UpstashRateLimitStore — direct tests
// ---------------------------------------------------------------------------

test("UpstashRateLimitStore: first increment sets TTL and returns count=1", async () => {
  const now = 1_000_000;
  const redis = new FakeRedis(() => now);
  const store = new UpstashRateLimitStore(redis, { nowFn: () => now });

  const r = await store.incrementWithTtl("k", 60);
  assert.equal(r.count, 1);
  assert.equal(r.ttlRemainingMs, 60_000);
  assert.equal(redis.keys.get("k")?.expiresAtMs, 1_060_000);
});

test("UpstashRateLimitStore: subsequent increments do NOT extend TTL", async () => {
  let now = 1_000_000;
  const redis = new FakeRedis(() => now);
  const store = new UpstashRateLimitStore(redis, { nowFn: () => now });

  await store.incrementWithTtl("k", 60);
  const expiresAfterFirst = redis.keys.get("k")!.expiresAtMs;

  now += 20_000;
  const second = await store.incrementWithTtl("k", 60);
  assert.equal(second.count, 2);
  assert.equal(second.ttlRemainingMs, 40_000);
  assert.equal(
    redis.keys.get("k")!.expiresAtMs,
    expiresAfterFirst,
    "TTL must be set only on the first increment (EXPIRE ... NX)",
  );

  now += 20_000;
  const third = await store.incrementWithTtl("k", 60);
  assert.equal(third.count, 3);
  assert.equal(third.ttlRemainingMs, 20_000);
});

test("UpstashRateLimitStore: counter resets after TTL expires", async () => {
  let now = 1_000_000;
  const redis = new FakeRedis(() => now);
  const store = new UpstashRateLimitStore(redis, { nowFn: () => now });

  await store.incrementWithTtl("k", 60);
  await store.incrementWithTtl("k", 60);

  now += 61_000;

  const afterExpiry = await store.incrementWithTtl("k", 60);
  assert.equal(afterExpiry.count, 1, "counter should reset after TTL");
  assert.equal(afterExpiry.ttlRemainingMs, 60_000);
});

test("UpstashRateLimitStore: transport failure falls back to memory", async () => {
  const redis = new FakeRedis();
  const errors: unknown[] = [];
  const store = new UpstashRateLimitStore(redis, {
    onError: (err) => {
      errors.push(err);
    },
  });

  redis.failNextExecWith = new Error("connection refused");
  const r = await store.incrementWithTtl("k", 60);
  assert.equal(r.count, 1);
  assert.equal(errors.length, 1);

  // Second call succeeds against the real (fake) Redis — but the memory
  // fallback from the first call has count=1 too; we're not testing the
  // cross-path consistency here, only that the route didn't throw.
  const r2 = await store.incrementWithTtl("k", 60);
  assert.ok(r2.count >= 1);
});

test("UpstashRateLimitStore: malformed INCR response emits typed EngineError and falls back", async () => {
  class MalformedRedis extends FakeRedis {
    pipeline(): UpstashPipelineLike {
      const p = super.pipeline();
      return {
        incr: p.incr.bind(p),
        expire: p.expire.bind(p),
        pttl: p.pttl.bind(p),
        async exec() {
          return ["not-a-number", 1, 60_000];
        },
      };
    }
  }

  const redis = new MalformedRedis();
  const errors: unknown[] = [];
  const store = new UpstashRateLimitStore(redis, {
    onError: (err) => errors.push(err),
  });

  const r = await store.incrementWithTtl("k", 60);
  assert.equal(r.count, 1, "fallback memory store should still allow request");
  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof RateLimitRecoverableError);
});

test("UpstashRateLimitStore: reset() deletes the key on both stores", async () => {
  const redis = new FakeRedis();
  const store = new UpstashRateLimitStore(redis);

  await store.incrementWithTtl("k", 60);
  await store.reset("k");

  const r = await store.incrementWithTtl("k", 60);
  assert.equal(r.count, 1);
});

// ---------------------------------------------------------------------------
// checkRateLimitAsync against the Upstash path
// ---------------------------------------------------------------------------

test("checkRateLimitAsync: Upstash store allows 3 then blocks the 4th", async () => {
  const redis = new FakeRedis();
  const store = new UpstashRateLimitStore(redis);
  const req = mkRequest("10.9.0.1");

  for (let i = 0; i < 3; i += 1) {
    const r = await checkRateLimitAsync(
      req,
      { windowMs: 60_000, maxRequests: 3 },
      store,
    );
    assert.equal(r.allowed, true, `call ${i + 1}`);
    assert.equal(r.count, i + 1);
  }
  const blocked = await checkRateLimitAsync(
    req,
    { windowMs: 60_000, maxRequests: 3 },
    store,
  );
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.count, 4);
  assert.ok(blocked.retryAfterMs > 0);
  assert.ok(blocked.retryAfterMs <= 60_000);
});

test("checkRateLimitAsync: counter resets after window expires", async () => {
  let now = 1_000_000;
  const redis = new FakeRedis(() => now);
  const store = new UpstashRateLimitStore(redis, { nowFn: () => now });
  const req = mkRequest("10.9.0.2");

  for (let i = 0; i < 3; i += 1) {
    await checkRateLimitAsync(
      req,
      { windowMs: 60_000, maxRequests: 3 },
      store,
    );
  }
  const blocked = await checkRateLimitAsync(
    req,
    { windowMs: 60_000, maxRequests: 3 },
    store,
  );
  assert.equal(blocked.allowed, false);

  now += 61_000;

  const reopened = await checkRateLimitAsync(
    req,
    { windowMs: 60_000, maxRequests: 3 },
    store,
  );
  assert.equal(reopened.allowed, true);
  assert.equal(reopened.count, 1);
});

// ---------------------------------------------------------------------------
// Factory — `createStore()` picks Upstash when env is set
// ---------------------------------------------------------------------------

test("createStore: picks Upstash when both env vars are set", () => {
  const redis = new FakeRedis();
  const store = createStore({
    env: {
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "fake-token",
    },
    upstashFactory: () => redis,
  });
  assert.equal(store.constructor.name, "UpstashRateLimitStore");
});

test("createStore: falls back to memory when upstashFactory throws", () => {
  const reasons: string[] = [];
  const store = createStore({
    env: {
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "fake-token",
      NODE_ENV: "production",
    },
    upstashFactory: () => {
      throw new Error("SDK missing");
    },
    onFallback: (reason) => {
      reasons.push(reason);
    },
  });
  assert.equal(store.constructor.name, "MemoryRateLimitStore");
  assert.deepEqual(reasons, ["import-failed"]);
});

test("createStore: factory receives the env values", () => {
  const seen: Array<[string, string]> = [];
  const redis = new FakeRedis();
  createStore({
    env: {
      UPSTASH_REDIS_REST_URL: "https://alpha.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "alpha-token",
    },
    upstashFactory: (url, token) => {
      seen.push([url, token]);
      return redis;
    },
  });
  assert.deepEqual(seen, [["https://alpha.upstash.io", "alpha-token"]]);
});
