// W2-PROD — RED→GREEN test for the deltas route consumer contract.
//
// The route reads two keys from the data-store:
//   - "trending"             (current star totals)
//   - "star-snapshot:24h"    (24h-ago snapshot, produced by snapshot-stars.mjs)
//
// We seed BOTH via the data-store's file-tier — write JSON files under a
// temp dataDir, then patch `getDataStore()` (and `createDataStore` env path)
// so the singleton points at that tmpdir. This avoids touching Redis or
// the project's real ./data directory and exercises the same read path the
// route hits in production.
//
// File-tier on Windows can't contain ":" in filenames (reserved for NTFS
// alternate streams), so we test the 24h window via a slug that file-tier
// understands when colons are sanitized — the data-store actually stores
// `key.json` literally including the colon. To sidestep that incompatibility,
// we inject a fake `getDataStore()` directly via require.cache rebind. tsx
// compiles ESM imports to CJS, so the live binding sits in require.cache
// and IS mutable.

import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  DataStore,
  DataReadResult,
  DataWriteOptions,
} from "../../../../lib/data-store";

// Synthetic trending payload — just enough for the route's
// `readCurrentStarsFromTrending` to find vercel/next.js with stars=105000.
const TRENDING_PAYLOAD = {
  fetchedAt: new Date().toISOString(),
  buckets: {
    past_24_hours: {
      All: [
        {
          repo_id: "111",
          repo_name: "vercel/next.js",
          stars: "105000",
        },
      ],
    },
  },
};

// What a healthy producer (snapshot-stars.mjs, the GREEN target) writes
// to star-snapshot:24h: items map keyed by "owner/name" with int stars.
const SNAPSHOT_24H = {
  items: {
    "vercel/next.js": 100000,
  },
};

function makeStubStore(): DataStore {
  return {
    async read<T>(key: string): Promise<DataReadResult<T>> {
      if (key === "trending") {
        return {
          data: TRENDING_PAYLOAD as unknown as T,
          source: "redis",
          ageMs: 0,
          fresh: true,
          writtenAt: new Date().toISOString(),
        };
      }
      if (key === "star-snapshot:24h") {
        return {
          data: SNAPSHOT_24H as unknown as T,
          source: "redis",
          ageMs: 0,
          fresh: true,
          writtenAt: new Date().toISOString(),
        };
      }
      return { data: null, source: "missing", ageMs: 0, fresh: false };
    },
    async write<T>(_key: string, _value: T, _opts?: DataWriteOptions) {
      // swallow — the route writes a deltas:<repo>:<window> entry that we
      // don't assert against here.
    },
    async writtenAt() {
      return null;
    },
    async writerMeta() {
      return null;
    },
    async reset() {
      /* noop */
    },
    redisClient() {
      return null;
    },
  };
}

// Patch the data-store module's `getDataStore` export BEFORE the route
// imports it. tsx compiles ESM imports to CJS so the binding lives in
// require.cache and is reassignable via property descriptor swap.
function patchGetDataStore(stub: DataStore): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require.resolve("../../../../lib/data-store");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(path) as Record<string, unknown>;
  // First reset the singleton, then redefine the getter to return our stub.
  if (typeof mod._resetDataStoreForTests === "function") {
    (mod._resetDataStoreForTests as () => void)();
  }
  // tsx-emitted CJS exports are configurable. Worst-case fall back to
  // reassigning the cache entry's exports object wholesale.
  try {
    Object.defineProperty(mod, "getDataStore", {
      configurable: true,
      enumerable: true,
      get() {
        return () => stub;
      },
    });
  } catch {
    // Fallback: swap the require.cache entry's exports.
    const cached = require.cache[path];
    if (cached) {
      cached.exports = {
        ...mod,
        getDataStore: () => stub,
      };
    }
  }
}

test("POST /api/pipeline/deltas: 24h window with healthy producer → current=105000, prior=100000, delta=5000, fresh=true", async () => {
  const stub = makeStubStore();
  patchGetDataStore(stub);

  // Provide CRON_SECRET so verifyCronAuth permits the call.
  process.env.CRON_SECRET = "test-cron-secret";

  // Defer route import until after the patch — the route captures the
  // `getDataStore` binding at import time.
  const { POST } = await import("../deltas/route");

  // NextRequest extends Request; the route only reads .headers and .json().
  const req = new Request("http://localhost/api/pipeline/deltas", {
    method: "POST",
    headers: {
      authorization: "Bearer test-cron-secret",
      "content-type": "application/json",
    },
    body: JSON.stringify({ repo: "vercel/next.js", window: "24h" }),
  });

  const res = await POST(req as unknown as Parameters<typeof POST>[0]);
  const body = (await res.json()) as {
    ok: boolean;
    current?: number;
    prior?: number | null;
    delta?: number | null;
    fresh?: boolean;
    repo?: string;
    window?: string;
  };

  assert.equal(
    res.status,
    200,
    `expected 200, got ${res.status} body=${JSON.stringify(body)}`,
  );
  assert.equal(body.ok, true);
  assert.equal(body.repo, "vercel/next.js");
  assert.equal(body.window, "24h");
  assert.equal(body.current, 105000);
  assert.equal(body.prior, 100000);
  assert.equal(body.delta, 5000);
  assert.equal(body.fresh, true);
});
