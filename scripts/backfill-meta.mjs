#!/usr/bin/env node
//
// backfill-meta.mjs — one-off Redis meta backfill for AUDIT-2026-05-04.
//
// The audit found several `ss:data:v1:<key>` payloads with NO companion
// `ss:meta:v1:<key>` entry (notably `mcp-dependents`, `mcp-smithery-rank`).
// The reader tolerates missing meta — it falls back to file mtime — but
// `audit-freshness.mjs` and the `/api/freshness` route get null timestamps
// which look red on the dashboard.
//
// This script SCANs the data namespace, pairs each payload key with its
// expected meta key, and writes a meta entry for every orphaned data key.
// New entries use the writer-provenance object shape introduced by the
// same audit (writer="backfill", runId/commit absent — readers tolerate
// the partial shape).
//
// USAGE
//   node scripts/backfill-meta.mjs --dry-run   # list orphaned keys, write nothing
//   node scripts/backfill-meta.mjs             # write missing meta entries
//
// CONFIG (env, in priority order — same as _data-store-write.mjs)
//   REDIS_URL                  Railway-style redis://[user:pass@]host:port
//   UPSTASH_REDIS_REST_URL     Upstash REST URL (legacy)
//   UPSTASH_REDIS_REST_TOKEN   required when using the Upstash REST URL
//
// IDEMPOTENT: always SETs the meta key only when missing (GET first), so
// re-running the script doesn't overwrite real provenance written by a
// later collector run.

const NAMESPACE = "ss:data:v1";
const META_NAMESPACE = "ss:meta:v1";

const dryRun = process.argv.includes("--dry-run");

async function getClient() {
  const redisUrl = process.env.REDIS_URL?.trim();
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (redisUrl) {
    const { default: IORedis } = await import("ioredis");
    const client = new IORedis(redisUrl, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5_000,
    });
    client.on("error", (err) => {
      console.warn(`[backfill-meta] ioredis transport error: ${err.message}`);
    });
    return { kind: "ioredis", client };
  }

  if (upstashUrl && upstashToken) {
    const { Redis } = await import("@upstash/redis");
    const client = new Redis({ url: upstashUrl, token: upstashToken });
    return { kind: "upstash", client };
  }

  throw new Error(
    "[backfill-meta] No Redis backend configured. Set REDIS_URL (preferred) or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.",
  );
}

async function* scanKeys(handle, pattern) {
  if (handle.kind === "ioredis") {
    let cursor = "0";
    do {
      // ioredis: SCAN cursor MATCH pattern COUNT n returns [next, keys[]]
      const [next, keys] = await handle.client.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = next;
      for (const k of keys) yield k;
    } while (cursor !== "0");
    return;
  }
  // Upstash: scan returns { cursor, keys }
  let cursor = "0";
  do {
    const res = await handle.client.scan(cursor, { match: pattern, count: 200 });
    // Upstash SDK returns either [cursor, keys] or { cursor, keys } depending
    // on version; normalise.
    const next = Array.isArray(res) ? res[0] : res.cursor;
    const keys = Array.isArray(res) ? res[1] : res.keys;
    cursor = String(next);
    for (const k of keys) yield k;
  } while (cursor !== "0");
}

async function getRaw(handle, key) {
  if (handle.kind === "ioredis") return handle.client.get(key);
  return handle.client.get(key);
}

async function setRaw(handle, key, value) {
  if (handle.kind === "ioredis") return handle.client.set(key, value);
  return handle.client.set(key, value);
}

async function quit(handle) {
  if (handle.kind === "ioredis") {
    try {
      await handle.client.quit();
    } catch {
      /* ignore */
    }
  }
  // Upstash REST has no persistent connection; nothing to close.
}

async function main() {
  const handle = await getClient();
  const orphans = [];
  const total = { data: 0, meta: 0 };

  console.log(
    `[backfill-meta] scanning ${NAMESPACE}:* (dryRun=${dryRun}, backend=${handle.kind})`,
  );

  for await (const dataKey of scanKeys(handle, `${NAMESPACE}:*`)) {
    total.data++;
    const slug = dataKey.slice(NAMESPACE.length + 1);
    const expectedMetaKey = `${META_NAMESPACE}:${slug}`;
    const existingMeta = await getRaw(handle, expectedMetaKey);
    if (existingMeta === null || existingMeta === undefined) {
      orphans.push({ slug, dataKey, metaKey: expectedMetaKey });
    } else {
      total.meta++;
    }
  }

  if (orphans.length === 0) {
    console.log(`[backfill-meta] no orphans found (data=${total.data}, meta=${total.meta})`);
    await quit(handle);
    return;
  }

  console.log(
    `[backfill-meta] found ${orphans.length} orphan data key(s) without meta:`,
  );
  for (const o of orphans) console.log(`  - ${o.slug}`);

  if (dryRun) {
    console.log("[backfill-meta] dry-run — no writes performed");
    await quit(handle);
    return;
  }

  const writtenAt = new Date().toISOString();
  const metaValue = JSON.stringify({ writtenAt, writer: "backfill" });

  let written = 0;
  for (const o of orphans) {
    // Re-check before writing to stay idempotent — a collector may have
    // landed a real meta entry between scan and write.
    const recheck = await getRaw(handle, o.metaKey);
    if (recheck !== null && recheck !== undefined) {
      console.log(`  ↷ skip ${o.slug} (meta arrived during scan)`);
      continue;
    }
    await setRaw(handle, o.metaKey, metaValue);
    written++;
  }

  console.log(
    `[backfill-meta] wrote ${written} meta entr${written === 1 ? "y" : "ies"} (writer="backfill", writtenAt=${writtenAt})`,
  );
  await quit(handle);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill-meta] FAILED", err);
    process.exit(1);
  });
