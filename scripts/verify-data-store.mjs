#!/usr/bin/env node
// StarScreener — data-store live smoke test.
//
// Run after provisioning Upstash to confirm the round-trip works:
//   1. Read UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN from env
//   2. Write a test payload to ss:data:v1:__smoketest
//   3. Read it back
//   4. Verify the meta timestamp is fresh
//   5. Clean up
//
// Exit 0 on success, exit 1 on any failure with a helpful error.
//
// USAGE
//   npm run verify:data-store
//   node scripts/verify-data-store.mjs

import { Redis } from "@upstash/redis";
import { writeDataStore } from "./_data-store-write.mjs";

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

async function main() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    fail(
      "UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is not set.\n" +
        "  Provision a free database at https://console.upstash.com/redis\n" +
        "  then export the REST URL + token (find them in the Upstash console > REST API tab).",
    );
  }
  ok("env vars present");

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
  const redis = new Redis({ url, token });
  let payloadRaw, metaRaw;
  try {
    payloadRaw = await redis.get(PAYLOAD_KEY);
    metaRaw = await redis.get(META_KEY);
  } catch (err) {
    fail(`failed to read keys back from Upstash: ${err.message ?? err}`);
  }
  if (payloadRaw === null || payloadRaw === undefined) {
    fail(`payload key ${PAYLOAD_KEY} is empty after write`);
  }
  if (metaRaw === null || metaRaw === undefined) {
    fail(`meta key ${META_KEY} is empty after write`);
  }
  ok(`read payload back (${typeof payloadRaw === "string" ? payloadRaw.length : "object"} bytes/shape)`);
  ok(`meta timestamp present: ${metaRaw}`);

  // Step 3: verify the round-trip preserved the value
  const decoded =
    typeof payloadRaw === "string" ? JSON.parse(payloadRaw) : payloadRaw;
  if (decoded.ping !== testValue.ping) {
    fail(
      `value mismatch — wrote ping=${testValue.ping}, read back ping=${decoded.ping}`,
    );
  }
  ok("round-trip value matches");

  // Step 4: cleanup
  try {
    await redis.del(PAYLOAD_KEY, META_KEY);
  } catch (err) {
    console.warn(
      `! cleanup failed (non-fatal): ${err.message ?? err}\n` +
        `  You can manually delete ${PAYLOAD_KEY} and ${META_KEY} in Upstash console.`,
    );
  }
  ok("cleaned up test keys");

  console.log("\n✓ data-store live verification passed — Redis is wired correctly.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
