// StarScreener — collector-side writer for the data-store.
//
// ESM helper used by every collector in scripts/. Mirrors the write surface
// of src/lib/data-store.ts so that data lands in Redis under the same keys
// the Next.js readers fetch from.
//
// Why a separate file rather than importing data-store.ts:
//   - Collectors run as plain `node` (not tsx), so they can't import .ts.
//   - Keeping the writer minimal here avoids a transpile step in CI.
//   - Same key namespace (`ss:data:v1:<slug>` + `ss:meta:v1:<slug>`) so the
//     two stay in lockstep.
//
// USAGE
//   import { writeDataStore } from "./_data-store-write.mjs";
//   await writeDataStore("trending", trendsPayload);
//
// CONFIG (env, in priority order)
//   REDIS_URL                  Railway-style redis://[user:pass@]host:port — preferred
//   UPSTASH_REDIS_REST_URL     Upstash REST URL (legacy / alternative)
//   UPSTASH_REDIS_REST_TOKEN   required when using the Upstash REST URL
//   DATA_STORE_DISABLE         if "1"/"true", skips Redis write entirely
//                              (escape hatch for local dev / dry runs)
//
// BEHAVIOR
//   - When env is missing: logs once, returns successfully. Caller's existing
//     file write path keeps working unchanged.
//   - When Redis errors: throws. CI workflows fail-loud rather than silently
//     diverging from the file snapshot.
//   - Always writes BOTH the payload (under `ss:data:v1:<slug>`) and the meta
//     timestamp (under `ss:meta:v1:<slug>`) so the reader can report freshness.
//   - On collector exit, call closeDataStore() (or just let the script exit —
//     ioredis allows the process to terminate even with a connected client).

const NAMESPACE = "ss:data:v1";
const META_NAMESPACE = "ss:meta:v1";

let cachedClient = null;
let warnedAboutMissingEnv = false;

async function getClient() {
  if (cachedClient !== null) return cachedClient;

  const disabled =
    process.env.DATA_STORE_DISABLE === "1" ||
    process.env.DATA_STORE_DISABLE === "true";
  if (disabled) {
    cachedClient = false;
    return false;
  }

  const redisUrl = process.env.REDIS_URL?.trim();
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  // Path 1: Railway-style ioredis (TCP). Preferred.
  if (redisUrl) {
    const { default: IORedis } = await import("ioredis");
    const client = new IORedis(redisUrl, {
      maxRetriesPerRequest: 3,
      // Default enableOfflineQueue=true so first command queues until
      // connect completes rather than failing "Stream isn't writeable".
      connectTimeout: 5_000,
    });
    client.on("error", (err) => {
      console.warn(
        `[data-store-write] ioredis transport error: ${err.message}`,
      );
    });
    cachedClient = makeIoRedisAdapter(client);
    return cachedClient;
  }

  // Path 2: Upstash REST (legacy). Kept for backwards compatibility so a
  // half-migrated env keeps working without a code change.
  if (upstashUrl && upstashToken) {
    const { Redis } = await import("@upstash/redis");
    cachedClient = new Redis({ url: upstashUrl, token: upstashToken });
    return cachedClient;
  }

  if (!warnedAboutMissingEnv) {
    warnedAboutMissingEnv = true;
    console.warn(
      "[data-store-write] REDIS_URL not set (and no Upstash REST creds either) — " +
        "skipping Redis write. Set REDIS_URL to the Railway redis:// URL to activate. " +
        "(Set DATA_STORE_DISABLE=1 to silence this warning.)",
    );
  }
  cachedClient = false;
  return false;
}

/**
 * Adapt the ioredis API to the same shape Upstash REST exposes
 * (set(key, value, { ex: number })). Lets the writeDataStore() body
 * stay agnostic to which backend is in use.
 */
function makeIoRedisAdapter(client) {
  return {
    _native: client,
    async set(key, value, opts) {
      if (opts && typeof opts.ex === "number" && opts.ex > 0) {
        return client.set(key, value, "EX", opts.ex);
      }
      return client.set(key, value);
    },
    async del(...keys) {
      return client.del(...keys);
    },
    async get(key) {
      return client.get(key);
    },
    async quit() {
      try {
        await client.quit();
      } catch {
        // ignore
      }
    },
  };
}

/**
 * Write a JSON payload to the data-store.
 *
 * @param {string} key       Slug, e.g. "trending" → ss:data:v1:trending
 * @param {unknown} value    Any JSON-serializable value
 * @param {{ ttlSeconds?: number }} [opts]
 * @returns {Promise<{ source: "redis" | "skipped"; writtenAt: string }>}
 */
export async function writeDataStore(key, value, opts = {}) {
  const writtenAt = new Date().toISOString();
  const client = await getClient();
  if (!client) {
    return { source: "skipped", writtenAt };
  }

  const payload = JSON.stringify(value);
  const setOpts =
    opts.ttlSeconds && opts.ttlSeconds > 0
      ? { ex: opts.ttlSeconds }
      : undefined;

  // Two SETs in parallel. ioredis supports MULTI/EXEC for true atomicity but
  // for our use case (collector scripts that run serially per source) a
  // brief inconsistency window between payload+meta is acceptable — the
  // reader treats meta-missing as "use file mtime fallback" and the next
  // read after meta lands sees both.
  await Promise.all([
    client.set(`${NAMESPACE}:${key}`, payload, setOpts),
    client.set(`${META_NAMESPACE}:${key}`, writtenAt, setOpts),
  ]);

  return { source: "redis", writtenAt };
}

/**
 * Gracefully close the underlying Redis connection. Optional — ioredis lets
 * the process exit cleanly even with a live client. Useful in long-running
 * scripts (e.g. test harness) that want explicit cleanup.
 */
export async function closeDataStore() {
  if (cachedClient && typeof cachedClient.quit === "function") {
    await cachedClient.quit();
  }
  cachedClient = null;
}

/**
 * Test helper — drop the cached client so subsequent calls re-resolve env.
 */
export function _resetForTests() {
  cachedClient = null;
  warnedAboutMissingEnv = false;
}
