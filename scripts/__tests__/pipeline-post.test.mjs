import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertSafeAuthDestination,
  buildRequest,
  parseArgs,
} from "../pipeline-post.mjs";

test("parseArgs: recompute defaults to local route with an empty JSON body", () => {
  const opts = parseArgs(["recompute"]);

  assert.equal(opts.baseUrl, "http://localhost:3023");
  assert.equal(opts.routePath, "/api/pipeline/recompute");
  assert.deepEqual(opts.body, {});
});

test("parseArgs: ingest sample uses the known operator sample payload", () => {
  const opts = parseArgs(["ingest", "--sample", "--prod"]);

  assert.equal(opts.baseUrl, "https://trendingrepo.com");
  assert.equal(opts.routePath, "/api/pipeline/ingest");
  assert.deepEqual(opts.body, {
    fullNames: ["vercel/next.js", "ollama/ollama", "anthropics/claude-code"],
  });
});

test("parseArgs: accepts explicit JSON body", () => {
  const opts = parseArgs(["ingest", "--body-json", "{\"fullNames\":[\"vercel/next.js\"]}"]);

  assert.deepEqual(opts.body, { fullNames: ["vercel/next.js"] });
});

test("buildRequest: sends authenticated pipeline JSON", () => {
  const request = buildRequest(
    {
      baseUrl: "https://trendingrepo.com",
      routePath: "/api/pipeline/recompute",
      body: {},
    },
    "secret-value",
  );

  assert.equal(request.url, "https://trendingrepo.com/api/pipeline/recompute");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers.Authorization, "Bearer secret-value");
  assert.equal(request.init.body, "{}");
});

test("assertSafeAuthDestination: refuses non-allowlisted secret destinations", () => {
  assert.doesNotThrow(() =>
    assertSafeAuthDestination("http://localhost:3023/api/pipeline/recompute"),
  );
  assert.doesNotThrow(() =>
    assertSafeAuthDestination("https://trendingrepo.com/api/pipeline/recompute"),
  );
  assert.throws(
    () => assertSafeAuthDestination("https://example.com/api/pipeline/recompute"),
    /refusing to send CRON_SECRET/,
  );
});
