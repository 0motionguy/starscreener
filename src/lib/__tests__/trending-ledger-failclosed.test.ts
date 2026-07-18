import assert from "node:assert/strict";
import { test } from "node:test";

import type { DataStore } from "../data-store";
import { DataStoreFatalError } from "../errors";

function patchGetDataStore(store: DataStore): void {
  const path = require.resolve("../data-store");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(path) as Record<string, unknown>;
  try {
    Object.defineProperty(mod, "getDataStore", {
      configurable: true,
      enumerable: true,
      get: () => () => store,
    });
  } catch {
    const cached = require.cache[path];
    if (cached) cached.exports = { ...mod, getDataStore: () => store };
  }
}

test("proposal fails closed when the outbound ledger cannot be read", async () => {
  const failure = new Error("redis unavailable");
  const store: DataStore = {
    async read() {
      throw failure;
    },
    async readMany() {
      throw failure;
    },
    async write() {},
    async writtenAt() {
      return null;
    },
    async reset() {},
    redisClient() {
      return null;
    },
  };
  patchGetDataStore(store);

  const { proposeTrendingPost } = await import("../twitter/outbound/trending-runner");
  await assert.rejects(
    () => proposeTrendingPost(Date.parse("2026-07-18T08:47:00Z"), "A"),
    (err) =>
      err instanceof DataStoreFatalError &&
      err.message.includes("outbound ledger read failed"),
  );
});
