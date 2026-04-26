// SOURCE OF TRUTH for the data-store namespace: ../../scripts/_data-store-write.mjs
// (relative to monorepo root). This file mirrors that contract in TypeScript so
// the worker package is self-contained. Namespace must stay in lockstep.

import type { Redis as IORedisType } from 'ioredis';
import type { RedisHandle } from './types.js';
import { loadEnv } from './env.js';

const NAMESPACE = 'ss:data:v1';
const META_NAMESPACE = 'ss:meta:v1';

let cachedHandle: RedisHandle | null = null;
let warned = false;

export interface DataStoreWriteResult {
  source: 'redis' | 'skipped';
  writtenAt: string;
}

export async function getRedis(): Promise<RedisHandle | null> {
  if (cachedHandle !== null) return cachedHandle;

  const env = loadEnv();
  if (env.DATA_STORE_DISABLE === '1' || env.DATA_STORE_DISABLE === 'true') {
    return null;
  }

  if (env.REDIS_URL) {
    const { Redis: IORedisCtor } = await import('ioredis');
    const client: IORedisType = new IORedisCtor(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5_000,
    });
    client.on('error', (err: Error) => {
      console.warn(`[redis] ioredis error: ${err.message}`);
    });
    cachedHandle = ioredisAdapter(client);
    return cachedHandle;
  }

  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = await import('@upstash/redis');
    const upstash = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
    cachedHandle = upstashAdapter(upstash);
    return cachedHandle;
  }

  if (!warned) {
    warned = true;
    console.warn('[redis] no REDIS_URL or UPSTASH_REDIS_REST_URL/TOKEN set - skipping writes');
  }
  return null;
}

function ioredisAdapter(client: IORedisType): RedisHandle {
  return {
    async get(key) {
      return client.get(key);
    },
    async set(key, value, opts) {
      if (opts?.ex && opts.ex > 0) {
        await client.set(key, value, 'EX', opts.ex);
      } else {
        await client.set(key, value);
      }
    },
    async del(key) {
      await client.del(key);
    },
    async quit() {
      try {
        await client.quit();
      } catch {
        /* ignore */
      }
    },
  };
}

interface UpstashLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ex?: number }): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
}

function upstashAdapter(client: UpstashLike): RedisHandle {
  return {
    async get(key) {
      return client.get(key);
    },
    async set(key, value, opts) {
      if (opts?.ex && opts.ex > 0) {
        await client.set(key, value, { ex: opts.ex });
      } else {
        await client.set(key, value);
      }
    },
    async del(key) {
      await client.del(key);
    },
    async quit() {
      // No-op for Upstash REST.
    },
  };
}

export async function writeDataStore(
  key: string,
  value: unknown,
  opts: { ttlSeconds?: number } = {},
): Promise<DataStoreWriteResult> {
  const writtenAt = new Date().toISOString();
  const handle = await getRedis();
  if (!handle) {
    return { source: 'skipped', writtenAt };
  }
  const payload = JSON.stringify(value);
  const setOpts = opts.ttlSeconds && opts.ttlSeconds > 0 ? { ex: opts.ttlSeconds } : undefined;
  await Promise.all([
    handle.set(`${NAMESPACE}:${key}`, payload, setOpts),
    handle.set(`${META_NAMESPACE}:${key}`, writtenAt, setOpts),
  ]);
  return { source: 'redis', writtenAt };
}

/**
 * Read a payload previously written to the data-store by writeDataStore (or
 * scripts/_data-store-write.mjs). Returns null if Redis is disabled, the key
 * is missing, or the stored value isn't valid JSON. Caller is responsible for
 * downcasting to the expected shape — there's no schema validation here.
 *
 * Used by derived fetchers (revenue-benchmarks, reddit-baselines, etc) that
 * compute on top of payloads other fetchers wrote.
 */
export async function readDataStore<T = unknown>(key: string): Promise<T | null> {
  const handle = await getRedis();
  if (!handle) return null;
  const raw = await handle.get(`${NAMESPACE}:${key}`);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function closeRedis(): Promise<void> {
  if (cachedHandle) {
    await cachedHandle.quit();
    cachedHandle = null;
  }
}
