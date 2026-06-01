import assert from "node:assert/strict";
import { test } from "node:test";

import {
  _resetLiveX402LastGoodForTests,
  fetchAddressTxs,
  fetchLiveX402,
  mapWithConcurrency,
} from "../agent-commerce/live-x402";

test("mapWithConcurrency preserves order while bounding active work", async () => {
  let active = 0;
  let maxActive = 0;
  const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return item * 10;
  });

  assert.deepEqual(result, [10, 20, 30, 40, 50]);
  assert.equal(maxActive, 2);
});

test("fetchAddressTxs returns empty data on timeout instead of hanging the route", async () => {
  const fetcher = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });
    })) as typeof fetch;

  const result = await fetchAddressTxs("0x0000000000000000000000000000000000000000", {
    fetcher,
    timeoutMs: 1,
  });

  assert.deepEqual(result, []);
});

test("fetchLiveX402 returns stale last-good data when all upstream calls later fail", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  try {
    _resetLiveX402LastGoodForTests();
    globalThis.fetch = (async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                hash: "0xgood",
                timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
              },
            ],
          }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    }) as typeof fetch;

    const good = await fetchLiveX402();
    assert.equal(good.healthy, true);
    assert.equal(good.totalObserved, 1);

    const stale = await fetchLiveX402();
    assert.equal(stale.healthy, false);
    assert.equal(stale.stale, true);
    assert.equal(stale.totalObserved, 1);
    assert.equal(stale.latestTxs[0]?.hash, "0xgood");
    assert.equal(stale.lastGoodAt, good.fetchedAt);
  } finally {
    _resetLiveX402LastGoodForTests();
    globalThis.fetch = originalFetch;
  }
});
