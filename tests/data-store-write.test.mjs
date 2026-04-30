// Round-trip tests for scripts/_data-store-write.mjs.
//
// Exercises only the DATA_STORE_DISABLE=1 path so the suite runs without any
// Redis infra. Each test resets the cached client via _resetForTests() so env
// changes between cases take effect.

import { test } from "node:test";
import assert from "node:assert";

import {
  writeDataStore,
  readDataStore,
  _resetForTests,
} from "../scripts/_data-store-write.mjs";

function withDisabled(fn) {
  return async (t) => {
    _resetForTests();
    const prevDisable = process.env.DATA_STORE_DISABLE;
    const prevRedisUrl = process.env.REDIS_URL;
    const prevUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const prevUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.DATA_STORE_DISABLE = "1";
    delete process.env.REDIS_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      await fn(t);
    } finally {
      if (prevDisable === undefined) delete process.env.DATA_STORE_DISABLE;
      else process.env.DATA_STORE_DISABLE = prevDisable;
      if (prevRedisUrl !== undefined) process.env.REDIS_URL = prevRedisUrl;
      if (prevUpstashUrl !== undefined)
        process.env.UPSTASH_REDIS_REST_URL = prevUpstashUrl;
      if (prevUpstashToken !== undefined)
        process.env.UPSTASH_REDIS_REST_TOKEN = prevUpstashToken;
      _resetForTests();
    }
  };
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

test(
  "writeDataStore returns skipped + ISO writtenAt for agent-commerce slug when disabled",
  withDisabled(async () => {
    const result = await writeDataStore("solana-x402-onchain", { foo: 1 });
    assert.strictEqual(result.source, "skipped");
    assert.match(result.writtenAt, ISO_RE);
  }),
);

test(
  "readDataStore returns null when disabled",
  withDisabled(async () => {
    const out = await readDataStore("anything");
    assert.strictEqual(out, null);
  }),
);

test(
  "stampTrackedRepos: tracked-repo-shaped items get lastRefreshedAt",
  withDisabled(async () => {
    const payload = { items: [{ fullName: "vercel/next.js", stars: 100 }] };
    const result = await writeDataStore("trending", payload);
    assert.strictEqual(result.source, "skipped");
    assert.match(payload.items[0].lastRefreshedAt, ISO_RE);
    assert.strictEqual(payload.items[0].lastRefreshedAt, result.writtenAt);
  }),
);

test(
  "stampTrackedRepos: non-repo records (e.g. tx samples) are NOT stamped",
  withDisabled(async () => {
    const payload = {
      samples: [{ txSig: "5xY...abc", slot: 312345678, ts: 1700000000 }],
    };
    await writeDataStore("solana-x402-onchain", payload);
    assert.strictEqual(
      "lastRefreshedAt" in payload.samples[0],
      false,
      "tx-shaped samples must not be stamped",
    );
  }),
);

test(
  "stampPerRecord: false skips stamping even for tracked-repo shapes",
  withDisabled(async () => {
    const payload = { items: [{ fullName: "owner/repo" }] };
    await writeDataStore("trending", payload, { stampPerRecord: false });
    assert.strictEqual(
      "lastRefreshedAt" in payload.items[0],
      false,
      "stampPerRecord:false must short-circuit stamping",
    );
  }),
);

test(
  "DATA_STORE_DISABLE=1 wins over Upstash creds being set",
  withDisabled(async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token-not-used";
    _resetForTests();
    const result = await writeDataStore("solana-x402-onchain", { ok: true });
    assert.strictEqual(
      result.source,
      "skipped",
      "DATA_STORE_DISABLE must beat Upstash env vars",
    );
    assert.match(result.writtenAt, ISO_RE);
    assert.strictEqual(await readDataStore("anything"), null);
  }),
);
