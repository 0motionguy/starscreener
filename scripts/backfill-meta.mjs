#!/usr/bin/env node
//
// backfill-meta.mjs — Redis orphan-key sweep for AUDIT-2026-05-04.
//
// The audit found several `ss:data:v1:<key>` payloads with NO companion
// `ss:meta:v1:<key>` entry (notably `mcp-dependents`, `mcp-smithery-rank`).
// The reader tolerates missing meta — it falls back to file mtime — but
// `audit-freshness.mjs` and the `/api/freshness` route get null timestamps
// which look red on the dashboard.
//
// This script SCANs both namespaces, then:
//   1) backfills missing meta entries for payload keys
//   2) optionally prunes meta-only keys (meta exists, payload missing)
//
// Backfill runs by default; prune requires an explicit flag.
// New entries use the writer-provenance object shape introduced by the
// same audit (writer="backfill", runId/commit absent — readers tolerate
// the partial shape).
//
// USAGE
//   node scripts/backfill-meta.mjs --dry-run
//   node scripts/backfill-meta.mjs
//   node scripts/backfill-meta.mjs --dry-run --prune-meta-only
//   node scripts/backfill-meta.mjs --prune-meta-only
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
const INVALID_KEY_LITERALS = new Set(["null", "undefined"]);

const dryRun = process.argv.includes("--dry-run");
const pruneMetaOnly = process.argv.includes("--prune-meta-only");

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

async function delRaw(handle, key) {
  if (handle.kind === "ioredis") return handle.client.del(key);
  return handle.client.del(key);
}

async function main() {
  const handle = await getClient();
  const payloadKeys = [];
  const metaKeys = [];

  console.log(
    `[backfill-meta] scanning ${NAMESPACE}:* + ${META_NAMESPACE}:* (dryRun=${dryRun}, pruneMetaOnly=${pruneMetaOnly}, backend=${handle.kind})`,
  );

  for await (const dataKey of scanKeys(handle, `${NAMESPACE}:*`)) {
    payloadKeys.push(dataKey);
  }
  for await (const key of scanKeys(handle, `${META_NAMESPACE}:*`)) metaKeys.push(key);

  const payloadSlugs = new Set();
  const metaSlugs = new Set();
  for (const dataKey of payloadKeys) {
    const slug = dataKey.slice(NAMESPACE.length + 1);
    if (!slug || INVALID_KEY_LITERALS.has(slug.trim())) {
      console.warn(`[backfill-meta] skip invalid payload slug "${slug}" from key ${dataKey}`);
      continue;
    }
    payloadSlugs.add(slug);
  }
  for (const key of metaKeys) {
    const slug = key.slice(META_NAMESPACE.length + 1);
    if (!slug || INVALID_KEY_LITERALS.has(slug.trim())) {
      console.warn(`[backfill-meta] skip invalid meta slug "${slug}" from key ${key}`);
      continue;
    }
    metaSlugs.add(slug);
  }

  const payloadWithoutMeta = [];
  for (const slug of payloadSlugs) {
    if (!metaSlugs.has(slug)) {
      payloadWithoutMeta.push({
        slug,
        dataKey: `${NAMESPACE}:${slug}`,
        metaKey: `${META_NAMESPACE}:${slug}`,
      });
    }
  }
  const metaOnly = [];
  for (const slug of metaSlugs) {
    if (!payloadSlugs.has(slug)) metaOnly.push({ slug, metaKey: `${META_NAMESPACE}:${slug}` });
  }

  if (payloadWithoutMeta.length === 0 && metaOnly.length === 0) {
    console.log(
      `[backfill-meta] no orphans found (payload=${payloadSlugs.size}, meta=${metaSlugs.size})`,
    );
    await quit(handle);
    return;
  }

  if (payloadWithoutMeta.length > 0) {
    console.log(
      `[backfill-meta] payload-without-meta: ${payloadWithoutMeta.length}`,
    );
    for (const o of payloadWithoutMeta) console.log(`  - ${o.slug}`);
  }
  if (metaOnly.length > 0) {
    console.log(`[backfill-meta] meta-only: ${metaOnly.length}`);
    for (const o of metaOnly) console.log(`  - ${o.slug}`);
  }

  if (dryRun) {
    console.log("[backfill-meta] dry-run — no writes performed");
    await quit(handle);
    return;
  }

  const writtenAt = new Date().toISOString();
  const metaValue = JSON.stringify({ writtenAt, writer: "backfill" });

  let written = 0;
  for (const o of payloadWithoutMeta) {
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

  let deletedMetaOnly = 0;
  if (pruneMetaOnly) {
    for (const o of metaOnly) {
      const payloadCheck = await getRaw(handle, `${NAMESPACE}:${o.slug}`);
      if (payloadCheck !== null && payloadCheck !== undefined) continue;
      await delRaw(handle, o.metaKey);
      deletedMetaOnly++;
    }
  }

  console.log(
    `[backfill-meta] wrote ${written} meta entr${written === 1 ? "y" : "ies"} (writer="backfill", writtenAt=${writtenAt})`,
  );
  if (pruneMetaOnly) {
    console.log(
      `[backfill-meta] deleted ${deletedMetaOnly} meta-only orphan${deletedMetaOnly === 1 ? "" : "s"}`,
    );
  } else if (metaOnly.length > 0) {
    console.log(
      `[backfill-meta] meta-only keys were not deleted (pass --prune-meta-only to prune)`,
    );
  }
  await quit(handle);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill-meta] FAILED", err);
    process.exit(1);
  });
