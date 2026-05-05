import assert from "node:assert/strict";
import test from "node:test";

import {
  _resetEdgeResponseCacheForTests,
  getEdgeResponseCache,
} from "@/lib/api/edge-response-cache";

test("edge-response-cache: memory fallback stores and expires entries", async () => {
  _resetEdgeResponseCacheForTests();
  const cache = getEdgeResponseCache({});

  await cache.setJson("k1", { ok: true }, 1);
  const hit = await cache.getJson<{ ok: boolean }>("k1");
  assert.deepEqual(hit, { ok: true });

  await new Promise((resolve) => setTimeout(resolve, 1100));
  const miss = await cache.getJson("k1");
  assert.equal(miss, null);
});

test("edge-response-cache: singleton can be reset for deterministic tests", async () => {
  _resetEdgeResponseCacheForTests();
  const a = getEdgeResponseCache({});
  const b = getEdgeResponseCache({});
  assert.equal(a, b);

  _resetEdgeResponseCacheForTests();
  const c = getEdgeResponseCache({});
  assert.notEqual(a, c);
});
