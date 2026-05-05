type RedisSetMode = "EX" | "PX" | "EXAT" | "PXAT";
type RedisScalar = string | number;

export interface RuntimeRedis {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode?: RedisSetMode,
    ttl?: number,
  ): Promise<unknown>;
  hincrby(key: string, field: string, increment: number): Promise<number>;
  hset(key: string, field: string, value: RedisScalar): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
  expire(key: string, seconds: number): Promise<number>;
  del?(...keys: string[]): Promise<number>;
  /**
   * Optional batch GET — single round trip (MGET) for ioredis, parallel
   * REST fan-out for Upstash. Returns values in the same order as `keys`,
   * with `null` for misses. AGN-467: lets admin pool-state collapse N+1
   * quarantine reads into one round trip.
   */
  mget?(...keys: string[]): Promise<(string | null)[]>;
  /**
   * Optional batched HGETALL — uses ioredis pipeline so N hash reads
   * incur 1 round trip on ioredis, falls back to parallel HGETALL on
   * Upstash REST. Returns hashes in the same order as `keys`. AGN-467:
   * lets admin pool-state collapse 24×N hourly bucket reads into one
   * round trip per pool.
   */
  hgetallMany?(keys: ReadonlyArray<string>): Promise<Record<string, string>[]>;
}

interface IoRedisPipeline {
  hgetall(key: string): IoRedisPipeline;
  exec(): Promise<Array<[Error | null, unknown]> | null>;
}

interface IoRedisNative {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  set(
    key: string,
    value: string,
    mode: RedisSetMode,
    ttl: number,
  ): Promise<unknown>;
  hincrby(key: string, field: string, increment: number): Promise<number>;
  hset(key: string, field: string, value: RedisScalar): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
  expire(key: string, seconds: number): Promise<number>;
  del(...keys: string[]): Promise<number>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  pipeline(): IoRedisPipeline;
  on(event: "error", listener: (err: Error) => void): unknown;
}

interface UpstashRedisNative {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: string, opts?: Record<string, number>): Promise<unknown>;
  hincrby(key: string, field: string, increment: number): Promise<number>;
  hset(key: string, values: Record<string, RedisScalar>): Promise<number>;
  hgetall<T = Record<string, unknown>>(key: string): Promise<T | null>;
  expire(key: string, seconds: number): Promise<number>;
  del(...keys: string[]): Promise<number>;
  mget<T = unknown>(...keys: string[]): Promise<(T | null)[]>;
}

type IoRedisCtor = new (
  url: string,
  options: Record<string, unknown>,
) => IoRedisNative;

let clientPromise: Promise<RuntimeRedis | null> | null = null;
let testRedis: RuntimeRedis | null | undefined;
let warned = false;

const noopRedis: RuntimeRedis = {
  async get() {
    return null;
  },
  async set() {
    return null;
  },
  async hincrby() {
    return 0;
  },
  async hset() {
    return 0;
  },
  async hgetall() {
    return {};
  },
  async expire() {
    return 0;
  },
  async del(...keys: string[]) {
    return keys.length;
  },
};

export const redis: RuntimeRedis = {
  async get(key) {
    const client = await runtimeRedisClient();
    return client.get(key);
  },
  async set(key, value, mode, ttl) {
    const client = await runtimeRedisClient();
    return client.set(key, value, mode, ttl);
  },
  async hincrby(key, field, increment) {
    const client = await runtimeRedisClient();
    return client.hincrby(key, field, increment);
  },
  async hset(key, field, value) {
    const client = await runtimeRedisClient();
    return client.hset(key, field, value);
  },
  async hgetall(key) {
    const client = await runtimeRedisClient();
    return client.hgetall(key);
  },
  async expire(key, seconds) {
    const client = await runtimeRedisClient();
    return client.expire(key, seconds);
  },
  async del(...keys) {
    const client = await runtimeRedisClient();
    return client.del ? client.del(...keys) : 0;
  },
  async mget(...keys) {
    if (keys.length === 0) return [];
    const client = await runtimeRedisClient();
    if (typeof client.mget === "function") return client.mget(...keys);
    // Fallback for the noop client / clients without batch GET.
    return Promise.all(keys.map((key) => client.get(key)));
  },
  async hgetallMany(keys) {
    if (keys.length === 0) return [];
    const client = await runtimeRedisClient();
    if (typeof client.hgetallMany === "function") {
      return client.hgetallMany(keys);
    }
    // Fallback: parallel single HGETALLs.
    return Promise.all(keys.map((key) => client.hgetall(key)));
  },
};

async function runtimeRedisClient(): Promise<RuntimeRedis> {
  if (testRedis !== undefined) return testRedis ?? noopRedis;
  if (!clientPromise) clientPromise = createRuntimeRedisClient();
  return (await clientPromise) ?? noopRedis;
}

async function createRuntimeRedisClient(): Promise<RuntimeRedis | null> {
  const redisUrl = process.env.REDIS_URL?.trim();
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  try {
    if (redisUrl) return createIoRedisClient(redisUrl);
    if (upstashUrl && upstashToken) return createUpstashRedisClient(upstashUrl, upstashToken);
  } catch (err) {
    warnOnce(err);
  }
  return null;
}

function createIoRedisClient(url: string): RuntimeRedis {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("ioredis") as { default?: IoRedisCtor };
  const IORedisCtor = mod.default ?? (mod as unknown as IoRedisCtor);
  const client = new IORedisCtor(url, {
    maxRetriesPerRequest: 3,
    connectTimeout: 5_000,
    commandTimeout: 30_000,
  });
  client.on("error", (err) => warnOnce(err));
  // ioredis exposes get/set/hgetall/mget/del directly; layer in hgetallMany
  // via pipeline so admin pool-state can collapse 24×N hourly reads to one
  // round trip. Cast widens the native client to the shared RuntimeRedis
  // shape (mget already matches).
  const native = client as unknown as RuntimeRedis & {
    pipeline: IoRedisNative["pipeline"];
  };
  native.hgetallMany = async (keys) => {
    if (keys.length === 0) return [];
    const pipeline = client.pipeline();
    for (const key of keys) pipeline.hgetall(key);
    const results = await pipeline.exec();
    if (!results) return keys.map(() => ({}));
    return results.map(([err, value]) => {
      if (err || !value || typeof value !== "object") return {};
      return value as Record<string, string>;
    });
  };
  return native;
}

function createUpstashRedisClient(url: string, token: string): RuntimeRedis {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@upstash/redis") as {
    Redis: new (config: { url: string; token: string }) => UpstashRedisNative;
  };
  const client = new mod.Redis({ url, token });
  return {
    async get(key) {
      const value = await client.get<string>(key);
      return typeof value === "string" ? value : value === null ? null : String(value);
    },
    async set(key, value, mode, ttl) {
      const opts = redisSetOptions(mode, ttl);
      return opts ? client.set(key, value, opts) : client.set(key, value);
    },
    hincrby: (key, field, increment) => client.hincrby(key, field, increment),
    hset: (key, field, value) => client.hset(key, { [field]: value }),
    async hgetall(key) {
      const raw = await client.hgetall<Record<string, unknown>>(key);
      return stringifyHash(raw ?? {});
    },
    expire: (key, seconds) => client.expire(key, seconds),
    del: (...keys) => client.del(...keys),
    async mget(...keys) {
      if (keys.length === 0) return [];
      const values = await client.mget<string>(...keys);
      return values.map((v) =>
        typeof v === "string" ? v : v === null || v === undefined ? null : String(v),
      );
    },
    async hgetallMany(keys) {
      if (keys.length === 0) return [];
      // Upstash REST has no pipeline equivalent; parallel HGETALL calls
      // still saturate the HTTP connection pool and avoid the awaited-
      // sequential pattern admin pool-state had per token.
      const raws = await Promise.all(
        keys.map((key) => client.hgetall<Record<string, unknown>>(key)),
      );
      return raws.map((raw) => stringifyHash(raw ?? {}));
    },
  };
}

function redisSetOptions(
  mode: RedisSetMode | undefined,
  ttl: number | undefined,
): Record<string, number> | undefined {
  if (!mode || typeof ttl !== "number" || !Number.isFinite(ttl) || ttl <= 0) {
    return undefined;
  }
  if (mode === "EX") return { ex: ttl };
  if (mode === "PX") return { px: ttl };
  if (mode === "EXAT") return { exat: ttl };
  return { pxat: ttl };
}

function stringifyHash(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== null && value !== undefined) out[key] = String(value);
  }
  return out;
}

function warnOnce(err: unknown): void {
  if (warned) return;
  warned = true;
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[redis] runtime Redis unavailable: ${message}`);
}

export function _setRedisForTests(client: RuntimeRedis | null): void {
  testRedis = client;
  clientPromise = null;
  warned = false;
}

export function _resetRedisForTests(): void {
  testRedis = undefined;
  clientPromise = null;
  warned = false;
}
