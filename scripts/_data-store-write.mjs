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
// CONFIG (env)
//   UPSTASH_REDIS_REST_URL    required for Redis write
//   UPSTASH_REDIS_REST_TOKEN  required for Redis write
//   DATA_STORE_DISABLE        if "1"/"true", skips Redis write entirely
//                             (escape hatch for local dev / dry runs)
//
// BEHAVIOR
//   - When env is missing: logs once, returns successfully. Caller's existing
//     file write path keeps working unchanged.
//   - When Redis errors: throws. CI workflows fail-loud rather than silently
//     diverging from the file snapshot.
//   - Always writes BOTH the payload (under `ss:data:v1:<slug>`) and the meta
//     timestamp (under `ss:meta:v1:<slug>`) so the reader can report freshness.

import { Redis } from "@upstash/redis";

const NAMESPACE = "ss:data:v1";
const META_NAMESPACE = "ss:meta:v1";

let cachedClient = null;
let warnedAboutMissingEnv = false;

function getClient() {
  if (cachedClient !== null) return cachedClient;

  const disabled =
    process.env.DATA_STORE_DISABLE === "1" ||
    process.env.DATA_STORE_DISABLE === "true";
  if (disabled) {
    cachedClient = false;
    return false;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    if (!warnedAboutMissingEnv) {
      warnedAboutMissingEnv = true;
      console.warn(
        "[data-store-write] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set; " +
          "skipping Redis write. (Set DATA_STORE_DISABLE=1 to silence this warning.)",
      );
    }
    cachedClient = false;
    return false;
  }

  cachedClient = new Redis({ url, token });
  return cachedClient;
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
  const client = getClient();
  if (!client) {
    return { source: "skipped", writtenAt };
  }

  const payload = JSON.stringify(value);
  const setOpts =
    opts.ttlSeconds && opts.ttlSeconds > 0
      ? { ex: opts.ttlSeconds }
      : undefined;

  // Two SETs in parallel. Upstash REST has no MULTI/EXEC, so true atomicity
  // requires their pipeline API; for our use case (collector scripts that run
  // serially per source) a brief inconsistency window between payload+meta
  // is acceptable — the reader treats meta-missing as "use file mtime
  // fallback" and the next read after meta lands sees both.
  await Promise.all([
    client.set(`${NAMESPACE}:${key}`, payload, setOpts),
    client.set(`${META_NAMESPACE}:${key}`, writtenAt, setOpts),
  ]);

  return { source: "redis", writtenAt };
}

/**
 * Test helper — drop the cached client so subsequent calls re-resolve env.
 */
export function _resetForTests() {
  cachedClient = null;
  warnedAboutMissingEnv = false;
}
