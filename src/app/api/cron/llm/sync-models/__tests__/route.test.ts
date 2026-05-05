import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  DataStore,
  DataReadResult,
  DataWriteOptions,
} from "@/lib/data-store";

function makeStubStore(writes: Array<{ key: string; value: unknown }>): DataStore {
  return {
    async read<T>(): Promise<DataReadResult<T>> {
      return { data: null, source: "missing", ageMs: 0, fresh: false };
    },
    async write<T>(key: string, value: T, _opts?: DataWriteOptions) {
      writes.push({ key, value });
    },
    async writtenAt() {
      return null;
    },
    async writtenAtMany(keys: ReadonlyArray<string>) {
      return new Map(keys.map((k) => [k, null] as const));
    },
    async reset() {},
    redisClient() {
      return null;
    },
  };
}

function patchGetDataStore(stub: DataStore): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require.resolve("@/lib/data-store");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(path) as Record<string, unknown>;
  if (typeof mod._resetDataStoreForTests === "function") {
    (mod._resetDataStoreForTests as () => void)();
  }
  try {
    Object.defineProperty(mod, "getDataStore", {
      configurable: true,
      enumerable: true,
      get() {
        return () => stub;
      },
    });
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cached = require.cache[path];
    if (cached) {
      cached.exports = {
        ...mod,
        getDataStore: () => stub,
      };
    }
  }
}

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function makeReq() {
  return new Request("http://localhost/api/cron/llm/sync-models", {
    method: "POST",
    headers: { authorization: "Bearer cron-test-secret" },
  });
}

test("POST /api/cron/llm/sync-models retries once on 429 and succeeds", async () => {
  process.env.CRON_SECRET = "cron-test-secret";
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  const writes: Array<{ key: string; value: unknown }> = [];
  patchGetDataStore(makeStubStore(writes));

  let call = 0;
  globalThis.fetch = (async () => {
    call += 1;
    if (call === 1) {
      return new Response(JSON.stringify({ error: "rate limited" }), {
        status: 429,
        headers: { "retry-after": "0" },
      });
    }
    return new Response(
      JSON.stringify({ data: [{ id: "openai/gpt-4.1-mini", pricing: { prompt: "0.000001", completion: "0.000002" } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const { POST } = await import("../route");
  const res = await POST(makeReq() as never);
  const body = (await res.json()) as { ok: boolean; count?: number };

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(call, 2);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.key, "llm-model-metadata");
});

test("POST /api/cron/llm/sync-models retries on transport error and succeeds", async () => {
  process.env.CRON_SECRET = "cron-test-secret";
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  const writes: Array<{ key: string; value: unknown }> = [];
  patchGetDataStore(makeStubStore(writes));

  let call = 0;
  globalThis.fetch = (async () => {
    call += 1;
    if (call === 1) throw new Error("socket hang up");
    return new Response(JSON.stringify({ data: [{ id: "anthropic/claude-3.7-sonnet" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const { POST } = await import("../route");
  const res = await POST(makeReq() as never);
  const body = (await res.json()) as { ok: boolean };

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(call, 2);
  assert.equal(writes.length, 1);
});

test("POST /api/cron/llm/sync-models does not retry non-retryable 4xx", async () => {
  process.env.CRON_SECRET = "cron-test-secret";
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  const writes: Array<{ key: string; value: unknown }> = [];
  patchGetDataStore(makeStubStore(writes));

  let call = 0;
  globalThis.fetch = (async () => {
    call += 1;
    return new Response(JSON.stringify({ error: "bad request" }), { status: 400 });
  }) as typeof fetch;

  const { POST } = await import("../route");
  const res = await POST(makeReq() as never);
  const body = (await res.json()) as { ok: boolean; error?: string };

  assert.equal(res.status, 500);
  assert.equal(body.ok, false);
  assert.equal(call, 1);
  assert.equal(writes.length, 0);
});

test.after(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  if (ORIGINAL_NODE_ENV === undefined) {
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
  } else {
    (process.env as Record<string, string | undefined>).NODE_ENV = ORIGINAL_NODE_ENV;
  }
});
