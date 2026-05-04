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
  // AUDIT-2026-05-04 §B2 — meta carries WriterMeta envelope:
  //   { ts, writerId, sourceWorkflow, commitSha }
  // so /admin/staleness can show "GHA scrape-trending wrote this last"
  // vs "worker oss-trending wrote this last". The reader in
  // src/lib/data-store.ts (parseWriterMeta) accepts both this envelope
  // and legacy bare-ISO meta values for back-compat.
  const writerMeta = buildScriptWriterMeta(opts);
  const writtenAt = writerMeta.ts;

  if (opts.stampPerRecord !== false && value && typeof value === "object") {
    stampTrackedRepos(value, writtenAt);
  }

  const client = await getClient();
  if (!client) {
    return { source: "skipped", writtenAt };
  }

  const payload = JSON.stringify(value);
  const metaPayload = JSON.stringify(writerMeta);
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
    client.set(`${META_NAMESPACE}:${key}`, metaPayload, setOpts),
  ]);

  return { source: "redis", writtenAt };
}

/**
 * Build the WriterMeta envelope. Mirrors src/lib/data-store.ts
 * buildWriterMeta — same shape, same env-var precedence, so dual-writer
 * observability sees consistent provenance regardless of which path wrote.
 *
 * @returns {{ ts: string; writerId?: string; sourceWorkflow?: string; commitSha?: string; runId?: string }}
 */
function buildScriptWriterMeta(opts = {}) {
  const meta = { ts: new Date().toISOString() };
  const explicit = opts.writer?.trim?.() || process.env.WRITER_ID?.trim();
  if (explicit) meta.writerId = explicit;
  else if (process.env.GITHUB_WORKFLOW) {
    meta.writerId = `gha:${process.env.GITHUB_WORKFLOW}`;
  } else {
    meta.writerId = "script:local";
  }
  const wf = process.env.GITHUB_WORKFLOW?.trim();
  if (wf) meta.sourceWorkflow = wf;
  const sha = opts.commit?.trim?.() || process.env.GITHUB_SHA?.trim();
  if (sha) meta.commitSha = sha;
  const runId = opts.runId?.trim?.() || process.env.GITHUB_RUN_ID?.trim();
  if (runId) meta.runId = runId;
  return meta;
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
  const client = await getClient();
  if (!client) return null;
  const raw = await client.get(`${NAMESPACE}:${key}`);
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
