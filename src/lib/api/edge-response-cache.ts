import { EdgeCacheRecoverableError } from "@/lib/errors";

type EnvLike = Record<string, string | undefined>;

interface EdgeResponseCache {
  getJson<T>(key: string): Promise<T | null>;
  setJson<T>(key: string, value: T, ttlSec: number): Promise<void>;
}

interface MemoryEntry {
  expiresAtMs: number;
  value: unknown;
}

class MemoryEdgeResponseCache implements EdgeResponseCache {
  private readonly buckets = new Map<string, MemoryEntry>();

  async getJson<T>(key: string): Promise<T | null> {
    const item = this.buckets.get(key);
    if (!item) return null;
    if (item.expiresAtMs <= Date.now()) {
      this.buckets.delete(key);
      return null;
    }
    return item.value as T;
  }

  async setJson<T>(key: string, value: T, ttlSec: number): Promise<void> {
    this.buckets.set(key, {
      value,
      expiresAtMs: Date.now() + Math.max(1, ttlSec) * 1000,
    });
  }
}

interface UpstashRedisLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts: { ex: number }): Promise<unknown>;
}

class UpstashEdgeResponseCache implements EdgeResponseCache {
  private loggedFallback = false;

  constructor(
    private readonly redis: UpstashRedisLike,
    private readonly fallback: MemoryEdgeResponseCache,
  ) {}

  async getJson<T>(key: string): Promise<T | null> {
    try {
      return await this.redis.get<T>(key);
    } catch (error) {
      this.logFallback(error, "get");
      return this.fallback.getJson<T>(key);
    }
  }

  async setJson<T>(key: string, value: T, ttlSec: number): Promise<void> {
    try {
      await this.redis.set(key, value, { ex: Math.max(1, ttlSec) });
      return;
    } catch (error) {
      this.logFallback(error, "set");
    }
    await this.fallback.setJson(key, value, ttlSec);
  }

  private logFallback(error: unknown, operation: "get" | "set"): void {
    if (this.loggedFallback) return;
    this.loggedFallback = true;
    console.warn(
      "[edge-cache] close-edge cache unavailable, using memory fallback",
      new EdgeCacheRecoverableError(
        "Close-edge cache operation failed",
        { operation, reason: String(error) },
      ),
    );
  }
}

let sharedCache: EdgeResponseCache | null = null;

export function getEdgeResponseCache(
  env: EnvLike = process.env,
): EdgeResponseCache {
  if (sharedCache) return sharedCache;
  sharedCache = createEdgeResponseCache(env);
  return sharedCache;
}

function createEdgeResponseCache(env: EnvLike): EdgeResponseCache {
  const memory = new MemoryEdgeResponseCache();

  const url =
    env.EDGE_CACHE_REDIS_REST_URL?.trim() ||
    env.UPSTASH_REDIS_REST_URL?.trim() ||
    "";
  const token =
    env.EDGE_CACHE_REDIS_REST_TOKEN?.trim() ||
    env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    "";

  if (!url || !token) {
    return memory;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@upstash/redis") as {
      Redis: new (config: { url: string; token: string }) => UpstashRedisLike;
    };
    const redis = new mod.Redis({ url, token });
    return new UpstashEdgeResponseCache(redis, memory);
  } catch (error) {
    console.warn(
      "[edge-cache] failed to initialize Upstash client, using memory fallback",
      new EdgeCacheRecoverableError(
        "Close-edge cache client initialization failed",
        { reason: String(error) },
      ),
    );
    return memory;
  }
}

export function _resetEdgeResponseCacheForTests(): void {
  sharedCache = null;
}
