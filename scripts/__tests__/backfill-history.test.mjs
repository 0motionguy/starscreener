import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertSafeAuthDestination,
  buildRequest,
  parseArgs,
} from "../backfill-history.mjs";

test("parseArgs: builds a local request target by default", () => {
  const opts = parseArgs(["vercel/next.js", "--max-pages", "50"]);

  assert.equal(opts.baseUrl, "http://localhost:3023");
  assert.equal(opts.fullName, "vercel/next.js");
  assert.equal(opts.maxPages, 50);
  assert.equal(opts.dryRun, false);
});

test("parseArgs: supports prod and dry-run flags", () => {
  const opts = parseArgs(["--prod", "--dry-run", "ollama/ollama"]);

  assert.equal(opts.baseUrl, "https://trendingrepo.com");
  assert.equal(opts.fullName, "ollama/ollama");
  assert.equal(opts.dryRun, true);
});

test("buildRequest: sends the expected authenticated JSON payload", () => {
  const request = buildRequest(
    {
      baseUrl: "https://trendingrepo.com",
      fullName: "vercel/next.js",
      maxPages: 25,
      dryRun: false,
    },
    "secret-value",
  );

  assert.equal(request.url, "https://trendingrepo.com/api/pipeline/backfill-history");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers.Authorization, "Bearer secret-value");
  assert.deepEqual(JSON.parse(request.init.body), {
    fullName: "vercel/next.js",
    maxPages: 25,
  });
});

test("assertSafeAuthDestination: refuses non-allowlisted secret destinations", () => {
  assert.doesNotThrow(() =>
    assertSafeAuthDestination("http://localhost:3023/api/pipeline/backfill-history"),
  );
  assert.doesNotThrow(() =>
    assertSafeAuthDestination("https://trendingrepo.com/api/pipeline/backfill-history"),
  );
  assert.throws(
    () => assertSafeAuthDestination("https://example.com/api/pipeline/backfill-history"),
    /refusing to send CRON_SECRET/,
  );
});
