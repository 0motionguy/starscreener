import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { _setStoreForTests } from "../../../../../lib/api/rate-limit";
import {
  MemoryRateLimitStore,
  _resetFallbackWarningForTests,
} from "../../../../../lib/api/rate-limit-store";

async function primeSaturatedStore(
  keyId: string,
  windowMs: number,
  maxRequests: number,
): Promise<void> {
  const store = new MemoryRateLimitStore();
  const ttlSec = Math.max(1, Math.ceil(windowMs / 1000));
  const key = `rl:${keyId}:${windowMs}:${maxRequests}`;
  for (let i = 0; i < maxRequests; i += 1) {
    await store.incrementWithTtl(key, ttlSec);
  }
  _setStoreForTests(store);
}

beforeEach(() => {
  _setStoreForTests(null);
  _resetFallbackWarningForTests();
});

after(() => {
  _setStoreForTests(null);
});

test("POST /api/compare/share: returns 429 + Retry-After when bucket is saturated", async () => {
  const route = await import("../route");
  const { NextRequest } = await import("next/server");

  const ip = "198.51.100.60";
  await primeSaturatedStore(
    ip,
    route.COMPARE_SHARE_WINDOW_MS,
    route.COMPARE_SHARE_MAX_REQUESTS,
  );

  const req = new Request("http://localhost/api/compare/share", {
    method: "POST",
    headers: {
      "x-forwarded-for": ip,
      "content-type": "application/json",
    },
    body: JSON.stringify({ repos: ["vercel/next.js"] }),
  });
  const res = await route.POST(new NextRequest(req) as never);

  assert.equal(res.status, 429);
  const retryAfter = res.headers.get("retry-after");
  assert.ok(retryAfter !== null && /^\d+$/.test(retryAfter));
  assert.ok(Number(retryAfter) >= 1);

  const body = (await res.json()) as { ok: boolean; code?: string; error: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, "RATE_LIMITED");
  assert.match(body.error, /rate limit exceeded/i);
});

test("persistCompareSharePayload: forwards finite ttlSeconds to store.write", async () => {
  const route = await import("../route");

  type WriteArgs = {
    key: string;
    value: unknown;
    opts?: { ttlSeconds?: number };
  };
  const writes: WriteArgs[] = [];
  const fakeStore = {
    async write(key: string, value: unknown, opts?: { ttlSeconds?: number }) {
      writes.push({ key, value, opts });
    },
  };

  await route.persistCompareSharePayload(fakeStore as never, {
    shortId: "ABCDEFGH",
    createdAt: new Date().toISOString(),
    repos: ["vercel/next.js"],
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].key, "compare-share/ABCDEFGH");
  assert.equal(
    writes[0].opts?.ttlSeconds,
    route.COMPARE_SHARE_TTL_SECONDS,
    "compare-share payloads must always be persisted with finite TTL",
  );
});
