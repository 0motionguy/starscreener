import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AGENT_COMMERCE_STORE_READ_TIMEOUT_MS,
  withRefreshTimeout,
} from "../agent-commerce/refresh-timeout";

test("withRefreshTimeout rejects a hung data-store read", async () => {
  const startedAt = Date.now();

  await assert.rejects(
    () =>
      withRefreshTimeout(
        new Promise<never>(() => undefined),
        "agent-commerce",
        1,
      ),
    /agent-commerce data-store read timeout/,
  );

  assert.ok(
    Date.now() - startedAt < 500,
    "timeout helper should stop waiting on a hung promise promptly",
  );
});

test("agent-commerce store read budget is short enough for route fan-out", () => {
  assert.equal(AGENT_COMMERCE_STORE_READ_TIMEOUT_MS, 1200);
});

test("agent-commerce route loaders bound Redis data-store reads", () => {
  const files = [
    "src/lib/agent-commerce.ts",
    "src/lib/base-x402-onchain.ts",
    "src/lib/solana-x402-onchain.ts",
    "src/lib/dune-x402-volume.ts",
  ] as const;

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.match(
      source,
      /withRefreshTimeout\(\s*store\.read</,
      `${file} must bound store.read so Redis slowness cannot stall /agent-commerce`,
    );
  }
});
