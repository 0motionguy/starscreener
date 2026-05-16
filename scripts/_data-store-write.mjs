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
const INVALID_KEY_LITERALS = new Set(["null", "undefined"]);

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
    // B.15 Arc 2 — batched GET. ioredis MGET returns Array<string|null>.
    async mget(...keys) {
      if (keys.length === 0) return [];
      return client.mget(...keys);
    },
    // B.15 Arc 2 — pipeline wrapper. Builds N commands into a single round
    // trip (and a single Upstash request when REST is the backend). Each
    // pipeline.exec() counts as 1 Upstash request regardless of N
    // sub-commands — that's the request-count savings for star-activity.
    pipeline() {
      const p = client.pipeline();
      return {
        _native: p,
        set(key, value, opts) {
          if (opts && typeof opts.ex === "number" && opts.ex > 0) {
            p.set(key, value, "EX", opts.ex);
          } else {
            p.set(key, value);
          }
          return this;
        },
        get(key) {
          p.get(key);
          return this;
        },
        async exec() {
          // ioredis pipeline.exec() returns Array<[Error|null, Result]>.
          // Normalize to Array<{ ok: boolean, value?, error? }> so callers
          // don't have to know which backend is in use.
          const raw = await p.exec();
          if (!raw) return [];
          return raw.map(([err, value]) => (err ? { ok: false, error: err } : { ok: true, value }));
        },
      };
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
 * Heuristic: does this object look like a tracked-repo record? We tag those
 * with a per-record `lastRefreshedAt` so the freshness UI can compute "data X
 * ago" from the *oldest* per-row timestamp rather than a single top-level
 * `fetchedAt` (which lies if the cron emits the same data twice).
 *
 * Conservative — only stamps records that clearly identify as tracked repos.
 * Doesn't touch posts, launches, articles, etc.
 */
function looksLikeTrackedRepo(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  // owner/name shape (most explicit)
  if (typeof record.fullName === "string" && record.fullName.includes("/")) return true;
  if (typeof record.repo_name === "string" && record.repo_name.includes("/")) return true;
  // OSS Insight shape (id + stars on the record)
  if (
    (typeof record.id === "string" || typeof record.id === "number") &&
    (typeof record.stars === "number" ||
      typeof record.stars === "string" ||
      typeof record.stargazers_count === "number")
  ) {
    return true;
  }
  return false;
}

/**
 * Walk a payload and stamp `lastRefreshedAt` on every nested record that
 * looks like a tracked repo. Mutates in-place — the writer constructs the
 * payload fresh each scan, so mutation is safe.
 *
 * Walks objects + arrays; preserves non-record children. Caps recursion depth
 * at 6 to avoid runaway walks on pathological structures.
 */
function stampTrackedRepos(value, ts, depth = 0) {
  if (depth > 6 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) stampTrackedRepos(item, ts, depth + 1);
    return;
  }
  if (looksLikeTrackedRepo(value) && !("lastRefreshedAt" in value)) {
    value.lastRefreshedAt = ts;
  }
  for (const child of Object.values(value)) {
    stampTrackedRepos(child, ts, depth + 1);
  }
}

/**
 * Write a JSON payload to the data-store.
 *
 * Side-effect: every nested record that looks like a tracked repo (owner/name
 * shape OR id+stars shape) gets a `lastRefreshedAt` field set to writtenAt.
 * Other records (posts, articles, launches) pass through unmodified.
 *
 * Provenance: when GITHUB_WORKFLOW / GITHUB_RUN_ID / GITHUB_SHA are present
 * (i.e. a GitHub Actions runner) the meta key is written as a JSON object
 * with writer/runId/commit so audits can attribute last-write-wins. Outside
 * GitHub Actions the meta key keeps the legacy bare-ISO-string shape, which
 * `parseWrittenAt` in src/lib/data-store.ts accepts back-compat.
 *
 * @param {string} key       Slug, e.g. "trending" → ss:data:v1:trending
 * @param {unknown} value    Any JSON-serializable value
 * @param {{ ttlSeconds?: number; stampPerRecord?: boolean; writer?: string; runId?: string; commit?: string }} [opts]
 *   stampPerRecord defaults to true; pass false to opt out for sources that
 *   manage their own per-record timestamps. Caller-supplied writer/runId/
 *   commit override the GitHub-Actions auto-detection.
 * @returns {Promise<{ source: "redis" | "skipped"; writtenAt: string }>}
 */
export async function writeDataStore(key, value, opts = {}) {
  if (typeof key !== "string") {
    throw new Error(
      `[data-store-write] invalid key type: expected string, received ${typeof key}`,
    );
  }
  const normalizedKey = key.trim();
  if (!normalizedKey || INVALID_KEY_LITERALS.has(normalizedKey)) {
    throw new Error(
      `[data-store-write] invalid key "${key}" - expected non-empty slug and not null/undefined`,
    );
  }

  const writtenAt = new Date().toISOString();

  if (opts.stampPerRecord !== false && value && typeof value === "object") {
    stampTrackedRepos(value, writtenAt);
  }

  const client = await getClient();
  if (!client) {
    return { source: "skipped", writtenAt };
  }

  const payload = JSON.stringify(value);
  const setOpts =
    opts.ttlSeconds && opts.ttlSeconds > 0
      ? { ex: opts.ttlSeconds }
      : undefined;

  // Build the meta value. JSON-object shape only when at least one
  // provenance field is present; otherwise keep the bare-ISO-string back-
  // compat shape that older readers still understand.
  const writer =
    opts.writer ??
    (process.env.GITHUB_WORKFLOW
      ? `github-actions:${process.env.GITHUB_WORKFLOW}`
      : undefined);
  const runId = opts.runId ?? process.env.GITHUB_RUN_ID;
  const commitFull = opts.commit ?? process.env.GITHUB_SHA;
  const commit = commitFull ? commitFull.slice(0, 7) : undefined;
  const hasProvenance =
    writer !== undefined || runId !== undefined || commit !== undefined;
  const metaValue = hasProvenance
    ? JSON.stringify({
        writtenAt,
        ...(writer !== undefined ? { writer } : {}),
        ...(runId !== undefined ? { runId } : {}),
        ...(commit !== undefined ? { commit } : {}),
      })
    : writtenAt;

  // Two SETs in parallel. ioredis supports MULTI/EXEC for true atomicity but
  // for our use case (collector scripts that run serially per source) a
  // brief inconsistency window between payload+meta is acceptable — the
  // reader treats meta-missing as "use file mtime fallback" and the next
  // read after meta lands sees both.
  await Promise.all([
    client.set(`${NAMESPACE}:${normalizedKey}`, payload, setOpts),
    client.set(`${META_NAMESPACE}:${normalizedKey}`, metaValue, setOpts),
  ]);

  return { source: "redis", writtenAt };
}

/**
 * B.15 Arc 2 — Batched read for many slugs in ONE Redis round-trip (and ONE
 * Upstash REST request when wired through pipeline.exec internally). Returns
 * an array aligned with the input slugs, each entry null if the slug is
 * missing / unparseable / Redis disabled.
 *
 * Use this instead of `readDataStore` in a loop when reading >10 slugs at
 * once. For star-activity (2980 slugs), splitting into chunks of N=100 turns
 * 2980 GETs into 30 MGETs — 99% request reduction against the Upstash quota.
 *
 * @param {string[]} keys Array of slugs.
 * @returns {Promise<Array<unknown | null>>}
 */
export async function readDataStoreMany(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return [];
  const client = await getClient();
  if (!client) return keys.map(() => null);
  // Normalize + map invalid keys to null pre-emptively to keep the response
  // array shape stable.
  const validIndices = [];
  const validKeys = [];
  for (let i = 0; i < keys.length; i += 1) {
    const k = typeof keys[i] === "string" ? keys[i].trim() : "";
    if (!k || INVALID_KEY_LITERALS.has(k)) continue;
    validIndices.push(i);
    validKeys.push(`${NAMESPACE}:${k}`);
  }
  const result = new Array(keys.length).fill(null);
  if (validKeys.length === 0) return result;
  // `mget` may or may not exist on the adapter (ioredis adapter added 2026-05-15,
  // @upstash/redis exposes it natively). Fall back to parallel single GETs.
  const raw =
    typeof client.mget === "function"
      ? await client.mget(...validKeys)
      : await Promise.all(validKeys.map((k) => client.get(k)));
  for (let i = 0; i < validIndices.length; i += 1) {
    const cell = raw[i];
    if (cell === null || cell === undefined) continue;
    if (typeof cell === "string") {
      try {
        result[validIndices[i]] = JSON.parse(cell);
      } catch {
        // leave null
      }
    } else if (typeof cell === "object") {
      // Upstash REST may auto-decode JSON.
      result[validIndices[i]] = cell;
    }
  }
  return result;
}

/**
 * B.15 Arc 2 — Batched write for many slug/value pairs. Builds a single
 * pipeline of 2N SETs (payload + meta per entry) and executes in ONE round
 * trip. Per-entry result reflects which payload AND meta SETs succeeded.
 *
 * Critical for staying under Upstash request quotas: pipeline.exec() counts
 * as 1 Upstash request regardless of N sub-commands.
 *
 * @param {Array<{ key: string, value: unknown, opts?: { ttlSeconds?: number } }>} entries
 * @param {{ stampPerRecord?: boolean; writer?: string; runId?: string; commit?: string }} [globalOpts]
 *   Applied to all entries (overridable per-entry not supported — keep it
 *   simple). stampPerRecord and writer/runId/commit follow the same rules
 *   as single-entry writeDataStore.
 * @returns {Promise<{ source: "redis" | "skipped"; writtenAt: string; results: Array<{ key: string, ok: boolean, error?: string }> }>}
 */
export async function writeDataStoreMany(entries, globalOpts = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { source: "skipped", writtenAt: new Date().toISOString(), results: [] };
  }
  const writtenAt = new Date().toISOString();

  // Per-record stamping mirrors single-write writeDataStore — applied before
  // serialization so the stored payload includes the lastRefreshedAt field.
  if (globalOpts.stampPerRecord !== false) {
    for (const entry of entries) {
      if (entry?.value && typeof entry.value === "object") {
        stampTrackedRepos(entry.value, writtenAt);
      }
    }
  }

  const client = await getClient();
  if (!client) {
    return {
      source: "skipped",
      writtenAt,
      results: entries.map((e) => ({ key: e.key, ok: false, error: "redis disabled" })),
    };
  }

  // Compose meta with provenance (same logic as single-write writeDataStore).
  const writer =
    globalOpts.writer ??
    (process.env.GITHUB_WORKFLOW
      ? `github-actions:${process.env.GITHUB_WORKFLOW}`
      : undefined);
  const runId = globalOpts.runId ?? process.env.GITHUB_RUN_ID;
  const commitFull = globalOpts.commit ?? process.env.GITHUB_SHA;
  const commit = commitFull ? commitFull.slice(0, 7) : undefined;
  const hasProvenance =
    writer !== undefined || runId !== undefined || commit !== undefined;
  const metaValue = hasProvenance
    ? JSON.stringify({
        writtenAt,
        ...(writer !== undefined ? { writer } : {}),
        ...(runId !== undefined ? { runId } : {}),
        ...(commit !== undefined ? { commit } : {}),
      })
    : writtenAt;

  // Build a single pipeline for all 2N SETs. If the adapter doesn't support
  // pipeline (older ioredis adapter shape, or a fake), fall back to parallel
  // single-key SETs — slower but correct.
  if (typeof client.pipeline !== "function") {
    const results = await Promise.all(
      entries.map(async (entry) => {
        try {
          const payload = JSON.stringify(entry.value);
          const setOpts =
            entry.opts?.ttlSeconds && entry.opts.ttlSeconds > 0
              ? { ex: entry.opts.ttlSeconds }
              : undefined;
          await client.set(`${NAMESPACE}:${entry.key.trim()}`, payload, setOpts);
          await client.set(`${META_NAMESPACE}:${entry.key.trim()}`, metaValue, setOpts);
          return { key: entry.key, ok: true };
        } catch (err) {
          return { key: entry.key, ok: false, error: String(err?.message ?? err) };
        }
      }),
    );
    return { source: "redis", writtenAt, results };
  }

  const pipeline = client.pipeline();
  const order = []; // remember entry order for result mapping
  for (const entry of entries) {
    const normalizedKey = entry.key.trim();
    if (!normalizedKey || INVALID_KEY_LITERALS.has(normalizedKey)) {
      // Push synthetic failure tracker — don't add to pipeline; we'll
      // emit ok:false directly in the result.
      order.push({ key: entry.key, valid: false });
      continue;
    }
    const payload = JSON.stringify(entry.value);
    const setOpts =
      entry.opts?.ttlSeconds && entry.opts.ttlSeconds > 0
        ? { ex: entry.opts.ttlSeconds }
        : undefined;
    pipeline.set(`${NAMESPACE}:${normalizedKey}`, payload, setOpts);
    pipeline.set(`${META_NAMESPACE}:${normalizedKey}`, metaValue, setOpts);
    order.push({ key: entry.key, valid: true });
  }
  const execResults = await pipeline.exec();
  // execResults is interleaved [payloadResult0, metaResult0, payloadResult1, ...]
  // for each valid entry. Map back per entry.
  const results = [];
  let cursor = 0;
  for (const o of order) {
    if (!o.valid) {
      results.push({ key: o.key, ok: false, error: "invalid key" });
      continue;
    }
    const payloadR = execResults[cursor];
    const metaR = execResults[cursor + 1];
    cursor += 2;
    if (payloadR && metaR && payloadR.ok && metaR.ok) {
      results.push({ key: o.key, ok: true });
    } else {
      const error = payloadR?.error ?? metaR?.error ?? "pipeline result missing";
      results.push({ key: o.key, ok: false, error: String(error?.message ?? error) });
    }
  }
  return { source: "redis", writtenAt, results };
}

/**
 * Read a JSON payload from the data-store under the same `ss:data:v1:<slug>`
 * namespace `writeDataStore` writes to. Returns `null` when Redis is disabled,
 * the key is missing, or the value cannot be parsed back to JSON. Used by
 * collectors that need to read-modify-write (e.g. star-activity append).
 *
 * @param {string} key Slug, e.g. "star-activity:vercel__next.js"
 * @returns {Promise<unknown | null>}
 */
export async function readDataStore(key) {
  if (typeof key !== "string") return null;
  const normalizedKey = key.trim();
  if (!normalizedKey || INVALID_KEY_LITERALS.has(normalizedKey)) return null;
  const client = await getClient();
  if (!client) return null;
  const raw = await client.get(`${NAMESPACE}:${normalizedKey}`);
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  // ioredis returns string-or-null. Upstash REST may auto-decode JSON to an
  // object — pass that through unchanged so the caller doesn't have to know
  // which backend is wired.
  if (typeof raw === "object") return raw;
  return null;
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
