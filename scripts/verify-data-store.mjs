#!/usr/bin/env node
// StarScreener — data-store live smoke test.
//
// Run after provisioning Redis to confirm the round-trip works:
//   1. Read REDIS_URL (or UPSTASH_REDIS_REST_URL + _TOKEN) from env
//   2. Write a test payload to ss:data:v1:__smoketest via writeDataStore()
//   3. Read it back via the same client the writer used
//   4. Verify the meta timestamp is fresh
//   5. Clean up
//
// Exit 0 on success, exit 1 on any failure with a helpful error.
//
// USAGE
//   npm run verify:data-store
//   node scripts/verify-data-store.mjs

import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";

const SLUG = "__smoketest";
const PAYLOAD_KEY = `ss:data:v1:${SLUG}`;
const META_KEY = `ss:meta:v1:${SLUG}`;

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

async function makeRawClient() {
  const redisUrl = process.env.REDIS_URL?.trim();
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (redisUrl) {
    const { default: IORedis } = await import("ioredis");
    const client = new IORedis(redisUrl, {
      maxRetriesPerRequest: 3,
      // Default enableOfflineQueue=true so first command queues until
      // connect completes rather than failing immediately.
      connectTimeout: 5_000,
    });
    client.on("error", () => {
      // Suppress — we'll surface failures via the get/del calls below.
    });
    return {
      kind: "ioredis",
      get: (key) => client.get(key),
      del: (...keys) => client.del(...keys),
      quit: () => client.quit().catch(() => {}),
    };
  }

  if (upstashUrl && upstashToken) {
    const { Redis } = await import("@upstash/redis");
    const client = new Redis({ url: upstashUrl, token: upstashToken });
    return {
      kind: "upstash",
      get: (key) => client.get(key),
      del: (...keys) => client.del(...keys),
      quit: () => Promise.resolve(),
    };
  }

  return null;
}

async function main() {
  const redisUrl = process.env.REDIS_URL?.trim();
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!redisUrl && !(upstashUrl && upstashToken)) {
    fail(
      "No Redis credentials in env.\n" +
        "  Either set REDIS_URL=redis://... (Railway-style)\n" +
        "  OR set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (Upstash REST).\n" +
        "  Find Railway's Redis URL in: project → <redis service> → Variables tab.",
    );
  }
  ok(`env vars present (${redisUrl ? "REDIS_URL / ioredis" : "Upstash REST"})`);

  // Step 1: write via the shared collector helper
  const testValue = {
    ping: Date.now(),
    note: "data-store smoke test",
    ranAt: new Date().toISOString(),
  };
  let writeResult;
  try {
    writeResult = await writeDataStore(SLUG, testValue);
  } catch (err) {
    fail(`writeDataStore failed: ${err.message ?? err}`);
  }
  if (writeResult.source !== "redis") {
    fail(
      `expected source=redis, got source=${writeResult.source}.\n` +
        "  Did you set DATA_STORE_DISABLE=1 by accident?",
    );
  }
  ok(`wrote payload to Redis (writtenAt=${writeResult.writtenAt})`);

  // Step 2: read raw via the SDK to confirm the keys landed
  const rawClient = await makeRawClient();
  if (!rawClient) {
    fail("could not instantiate raw client (env disappeared mid-run?)");
  }

  let payloadRaw, metaRaw;
  try {
    payloadRaw = await rawClient.get(PAYLOAD_KEY);
    metaRaw = await rawClient.get(META_KEY);
  } catch (err) {
    await rawClient.quit();
    await closeDataStore();
    fail(`failed to read keys back from Redis: ${err.message ?? err}`);
  }
  if (payloadRaw === null || payloadRaw === undefined) {
    await rawClient.quit();
    await closeDataStore();
    fail(`payload key ${PAYLOAD_KEY} is empty after write`);
  }
  if (metaRaw === null || metaRaw === undefined) {
    await rawClient.quit();
    await closeDataStore();
    fail(`meta key ${META_KEY} is empty after write`);
  }
  ok(
    `read payload back (${typeof payloadRaw === "string" ? payloadRaw.length + " bytes" : "object shape"})`,
  );
  ok(`meta timestamp present: ${metaRaw}`);

  // Step 3: verify the round-trip preserved the value
  const decoded =
    typeof payloadRaw === "string" ? JSON.parse(payloadRaw) : payloadRaw;
  if (decoded.ping !== testValue.ping) {
    await rawClient.quit();
    await closeDataStore();
    fail(
      `value mismatch — wrote ping=${testValue.ping}, read back ping=${decoded.ping}`,
    );
  }
  ok("round-trip value matches");

  // Step 4: cleanup
  try {
    await rawClient.del(PAYLOAD_KEY, META_KEY);
  } catch (err) {
    console.warn(
      `! cleanup failed (non-fatal): ${err.message ?? err}\n` +
        `  You can manually delete ${PAYLOAD_KEY} and ${META_KEY} in your Redis admin UI.`,
    );
  }
  ok("cleaned up test keys");

  await rawClient.quit();
  await closeDataStore();

  console.log(
    "\n✓ data-store live verification passed — Redis is wired correctly.\n",
  );
  process.exit(0);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Smoke test crashed:", err);
    process.exit(1);
  });
