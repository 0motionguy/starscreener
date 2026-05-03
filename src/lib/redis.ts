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
  return client;
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
