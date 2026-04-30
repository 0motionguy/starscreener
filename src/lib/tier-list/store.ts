// TrendingRepo — Tier List Redis-backed store helpers
//
// Reads + writes to `ss:data:v1:tier-lists/{shortId}` via a tier-list-scoped
// DataStore singleton. Server-only.
//
// Why the tier-list-scoped DataStore (not the global `getDataStore()`):
// the default ioredis factory in `src/lib/data-store.ts` stores
// `setFn = client.set as any` and calls it unbound. ioredis methods touch
// `this.options` internally, so the first SET that has no opts crashes with
// "Cannot read properties of undefined (reading 'options')". Callers in
// other parts of the app swallow that error in catch blocks; a tier-list
// save would fail loudly. We sidestep the bug by passing a `redisFactory`
// override that calls `client.set(...)` as a method (binding `this`
// implicitly), instead of through a stored function reference.

import "server-only";

import {
  createDataStore,
  type DataStore,
  type RedisClientLike,
} from "@/lib/data-store";
import {
  TIER_LIST_KEY_PREFIX,
  tierListStoreKey,
} from "@/lib/tier-list/constants";
import {
  generateShortId,
  isShortId,
} from "@/lib/tier-list/short-id";
import type { TierListPayload, TierListDraft } from "@/lib/types/tier-list";

const SHORT_ID_RETRY_LIMIT = 5;

// ---------------------------------------------------------------------------
// Tier-list-scoped DataStore singleton
// ---------------------------------------------------------------------------

let scopedStore: DataStore | null = null;

function getScopedStore(): DataStore {
  if (!scopedStore) {
    scopedStore = createDataStore({ redisFactory: tierListRedisFactory });
  }
  return scopedStore;
}

/**
 * ioredis factory with method-bound `set`. Identical to the default factory
 * in `src/lib/data-store.ts` except every Redis call goes through
 * `client.<method>(...)` (member access at call time = `this` bound) rather
 * than through a stored `as any` reference.
 */
function tierListRedisFactory(url: string, _token?: string): RedisClientLike {
  // Upstash REST gets routed through the default factory; only ioredis path
  // here. (Tier-list runs on Railway in prod, where REDIS_URL is `redis://`.)
  if (url.startsWith("https://") || url.startsWith("http://")) {
    // Fall back to the default factory for Upstash REST — which has no bind
    // bug because the Upstash SDK's set is a regular function, not a method
    // referencing `this`.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@upstash/redis") as {
      Redis: new (config: {
        url: string;
        token: string;
      }) => RedisClientLike;
    };
    if (!_token) {
      throw new Error(
        "[tier-list] Upstash REST URL requires UPSTASH_REDIS_REST_TOKEN.",
      );
    }
    return new mod.Redis({ url, token: _token });
  }

  // ioredis path with binding intact.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ioredisMod = require("ioredis") as
    | { default: typeof import("ioredis").default }
    | typeof import("ioredis").default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  const IORedisCtor =
    "default" in ioredisMod ? ioredisMod.default : ioredisMod;
  const client = new IORedisCtor(url, {
    maxRetriesPerRequest: 3,
    connectTimeout: 5_000,
  });
  client.on("error", (err: Error) => {
    console.warn("[tier-list] ioredis transport error:", err.message);
  });

  return {
    get: (key) => client.get(key),
    set: (key, value, opts) => {
      const hasEx = opts && typeof opts.ex === "number" && opts.ex > 0;
      const hasNx = opts?.nx === true;
      // Method calls — `client.set(...)` binds `this` implicitly. This is
      // the line that's wrong in the default factory.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = client as any;
      if (hasEx && hasNx) return c.set(key, value, "EX", opts!.ex, "NX");
      if (hasEx) return c.set(key, value, "EX", opts!.ex);
      if (hasNx) return c.set(key, value, "NX");
      return c.set(key, value);
    },
    del: (...keys) => client.del(...keys),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Fetch a tier list payload by shortId. Returns null if the slug is unknown. */
export async function getTierList(
  shortId: string,
): Promise<TierListPayload | null> {
  if (!isShortId(shortId)) return null;
  const store = getScopedStore();
  const result = await store.read<TierListPayload>(tierListStoreKey(shortId));
  return result.data;
}

/**
 * Persist a fresh tier list. Generates a unique shortId (retry on collision)
 * and writes through the tier-list-scoped data-store. Mirrors to
 * `data/tier-lists/{shortId}.json` during the file-mirror transition window.
 */
export async function createTierList(
  draft: TierListDraft,
): Promise<TierListPayload> {
  const store = getScopedStore();
  const now = new Date().toISOString();

  for (let attempt = 0; attempt < SHORT_ID_RETRY_LIMIT; attempt++) {
    const shortId = generateShortId();
    const existing = await store.read<TierListPayload>(
      tierListStoreKey(shortId),
    );
    if (existing.data !== null) continue; // collision — retry

    const payload: TierListPayload = {
      shortId,
      title: draft.title,
      description: draft.description,
      tiers: draft.tiers,
      unrankedItems: draft.unrankedItems,
      ownerHandle: draft.ownerHandle ?? null,
      createdAt: now,
      updatedAt: now,
      viewCount: 0,
      published: draft.published ?? false,
    };

    await store.write(tierListStoreKey(shortId), payload, {
      mirrorToFile: true,
    });

    return payload;
  }

  throw new Error(
    `[tier-list] Could not allocate a unique short id after ${SHORT_ID_RETRY_LIMIT} attempts.`,
  );
}

/** Constant re-export so callers don't need both modules. */
export { TIER_LIST_KEY_PREFIX };
