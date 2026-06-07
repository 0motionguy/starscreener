import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createPayloadReader,
  type CacheEntry,
  type RefreshResult,
} from "@/lib/data-store-reader";
import type { DataReadResult } from "@/lib/data-store";

function never<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

test("payload reader timeout clears public inflight so later refreshes can recover", async () => {
  let calls = 0;
  const reader = createPayloadReader<{ value: string }>({
    key: "demo",
    emptyPayload: { value: "empty" },
    minRefreshIntervalMs: 0,
    refreshTimeoutMs: 10,
    readFromStore: async <Raw = unknown>() => {
      calls += 1;
      if (calls === 1) return never();
      return {
        data: { value: "fresh" } as Raw,
        source: "redis",
        ageMs: 0,
        fresh: true,
        writtenAt: "2026-06-01T00:00:00.000Z",
      };
    },
  });

  const timedOut = await Promise.race<RefreshResult | "hung">([
    reader.refresh(),
    new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 100)),
  ]);

  assert.notEqual(timedOut, "hung");
  assert.equal((timedOut as RefreshResult).source, "missing");
  assert.deepEqual(reader.getPayload(), { value: "empty" });

  const recovered = await reader.refresh();
  assert.equal(recovered.source, "redis");
  assert.deepEqual(reader.getPayload(), { value: "fresh" });
  assert.equal(calls, 2);
});

test("payload reader ignores late timed-out store reads after a newer refresh wins", async () => {
  const first = deferred<DataReadResult<unknown>>();
  const second = deferred<DataReadResult<unknown>>();
  let calls = 0;
  const reader = createPayloadReader<{ value: string }>({
    key: "demo",
    emptyPayload: { value: "empty" },
    minRefreshIntervalMs: 0,
    refreshTimeoutMs: 10,
    readFromStore: <Raw = unknown>() => {
      calls += 1;
      return (calls === 1 ? first.promise : second.promise) as Promise<
        DataReadResult<Raw>
      >;
    },
  });

  const timedOut = await reader.refresh();
  assert.equal(timedOut.source, "missing");

  const secondRefresh = reader.refresh();
  second.resolve({
    data: { value: "fresh" },
    source: "redis",
    ageMs: 0,
    fresh: true,
    writtenAt: "2026-06-01T00:00:00.000Z",
  });
  await secondRefresh;

  first.resolve({
    data: { value: "stale" },
    source: "file",
    ageMs: 10_000,
    fresh: false,
    writtenAt: "2020-01-01T00:00:00.000Z",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(reader.getPayload(), { value: "fresh" });
  assert.equal((reader.getEntry() as CacheEntry<{ value: string }>).source, "redis");
});
