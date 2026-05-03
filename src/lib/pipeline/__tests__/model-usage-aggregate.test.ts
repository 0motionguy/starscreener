import assert from "node:assert/strict";
import { test } from "node:test";

import type { DataStore } from "../../data-store";
import { touchDailyAggregates } from "../../llm/aggregate";

test("touchDailyAggregates refreshes all LLM daily aggregate payloads", async () => {
  const writes = new Map<string, unknown>();
  const existing = new Map<string, unknown>([
    ["llm-daily-by-model", { rows: [{ day: "2026-05-03", model: "openai/gpt-5", provider: "openrouter" }] }],
  ]);
  const store = {
    async read<T>(key: string) {
      return {
        data: (existing.get(key) as T | undefined) ?? null,
        source: existing.has(key) ? "memory" : "missing",
        ageMs: 0,
        fresh: false,
      };
    },
    async write<T>(key: string, value: T) {
      writes.set(key, value);
    },
    async writtenAt() {
      return null;
    },
    async reset() {
      // no-op
    },
    redisClient() {
      return null;
    },
  } as DataStore;

  await touchDailyAggregates(store);

  assert.deepEqual([...writes.keys()].sort(), [
    "llm-daily-by-feature",
    "llm-daily-by-model",
    "llm-daily-summary",
  ]);
  assert.deepEqual(writes.get("llm-daily-by-model"), existing.get("llm-daily-by-model"));
  assert.deepEqual(writes.get("llm-daily-by-feature"), { rows: [] });
  assert.deepEqual(writes.get("llm-daily-summary"), { rows: [] });
});
