import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const X402_COLLECTORS = [
  {
    file: "scripts/fetch-base-x402-onchain.mjs",
    successCounter: "successfulAddressCalls",
    guard: "shouldWriteBaseX402Payload",
  },
  {
    file: "scripts/fetch-solana-x402-onchain.mjs",
    successCounter: "successfulAddressCalls",
    guard: "shouldWriteSolanaX402Payload",
  },
];

test("x402 collectors do not write all-failed empty payloads unless explicitly allowed", () => {
  for (const { file, successCounter, guard } of X402_COLLECTORS) {
    const source = readFileSync(file, "utf8");

    assert.match(source, /--allow-empty/, `${file} must expose an explicit allow-empty override`);
    assert.match(source, new RegExp(`\\b${successCounter}\\b`), `${file} must track successful upstream calls`);
    assert.match(source, new RegExp(`\\b${guard}\\b`), `${file} must gate writes through ${guard}`);
    assert.match(
      source,
      /no successful upstream calls; preserving last-good payload/,
      `${file} must preserve last-good data when every upstream call fails`,
    );
  }
});
