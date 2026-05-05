import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import {
  _resetGithubPoolBudgetDepsForTests,
  _setGithubPoolBudgetDepsForTests,
  isGithubPoolBudgetMuteActive,
  type GithubPoolBudgetSample,
  recordGithubPoolBudget,
} from "../github-pool-budget";

class FakeRedis {
  zsets = new Map<string, Array<{ score: number; member: string }>>();
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

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null;
  }

  async set(key: string, value: string, _mode: string, _ttl: number): Promise<"OK"> {
    this.strings.set(key, value);
    return "OK";
  }
}

afterEach(() => {
  _resetGithubPoolBudgetDepsForTests();
});

test("isGithubPoolBudgetMuteActive: supports windows and overnight ranges", () => {
  const inWindow = new Date("2026-05-05T00:10:00.000Z");
  const outWindow = new Date("2026-05-05T00:40:00.000Z");
  const overnight = new Date("2026-05-05T23:55:00.000Z");

  assert.equal(isGithubPoolBudgetMuteActive(inWindow, "00:00-00:30"), true);
  assert.equal(isGithubPoolBudgetMuteActive(outWindow, "00:00-00:30"), false);
  assert.equal(
    isGithubPoolBudgetMuteActive(overnight, "23:50-00:20"),
    true,
  );
});

test("recordGithubPoolBudget: alerts when rolling p95 used reaches 80%", async () => {
  const fake = new FakeRedis();
  const alerts: string[] = [];
  _setGithubPoolBudgetDepsForTests({
    redis: fake as never,
    captureMessage: (message) => {
      alerts.push(message);
      return "evt";
    },
  });

  const start = Date.parse("2026-05-05T01:00:00.000Z");
  for (let i = 0; i < 4; i += 1) {
    const sample: GithubPoolBudgetSample = {
      ts: start + i * 60_000,
      usedPct: 82,
      remaining: 900,
      capacity: 5_000,
      tokensSeen: 1,
      redisUnavailable: false,
    };
    await recordGithubPoolBudget(sample, { muteActive: false });
  }

  assert.equal(alerts.length > 0, true);
});
