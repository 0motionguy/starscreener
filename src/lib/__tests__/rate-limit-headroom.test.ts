import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import {
  _resetRateLimitHeadroomDepsForTests,
  _setRateLimitHeadroomDepsForTests,
  getRateLimitRolling,
  recordRateLimitSample,
} from "../rate-limit-headroom";

class FakeRedis {
  zsets = new Map<string, Array<{ score: number; member: string }>>();
  hashes = new Map<string, Map<string, string>>();
  strings = new Map<string, string>();

  async zadd(key: string, score: number, member: string): Promise<number> {
    const arr = this.zsets.get(key) ?? [];
    arr.push({ score, member });
    this.zsets.set(key, arr);
    return 1;
  }
  async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
    const arr = this.zsets.get(key) ?? [];
    const next = arr.filter((r) => !(r.score >= min && r.score <= max));
    this.zsets.set(key, next);
    return arr.length - next.length;
  }
  async zremrangebyrank(_key: string, _start: number, _stop: number): Promise<number> {
    return 0;
  }
  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    const arr = this.zsets.get(key) ?? [];
    return arr
      .filter((r) => r.score >= min && r.score <= max)
      .sort((a, b) => a.score - b.score)
      .map((r) => r.member);
  }
  async hset(key: string, field: string, value: string): Promise<number> {
    const map = this.hashes.get(key) ?? new Map<string, string>();
    map.set(field, value);
    this.hashes.set(key, map);
    return 1;
  }
  async hget(key: string, field: string): Promise<string | null> {
    return this.hashes.get(key)?.get(field) ?? null;
  }
  async expire(_key: string, _ttl: number): Promise<number> {
    return 1;
  }
  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null;
  }
  async set(key: string, value: string, _mode: string, _ttl: number): Promise<"OK"> {
    this.strings.set(key, value);
    return "OK";
  }
}

afterEach(() => {
  _resetRateLimitHeadroomDepsForTests();
});

test("recordRateLimitSample: emits alert when rolling p95 drops below 10%", async () => {
  const fake = new FakeRedis();
  const alerts: string[] = [];
  _setRateLimitHeadroomDepsForTests({
    redis: fake as never,
    captureMessage: (message) => {
      alerts.push(message);
      return "evt";
    },
  });

  for (let i = 0; i < 20; i += 1) {
    await recordRateLimitSample({
      source: "github",
      remaining: 5,
      limit: 100,
    });
  }

  const rolling = await getRateLimitRolling("github");
  assert.ok(rolling);
  assert.equal(rolling.alerting, true);
  assert.equal(rolling.p95Pct < 10, true);
  assert.equal(alerts.length > 0, true);
});
