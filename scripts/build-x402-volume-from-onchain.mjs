#!/usr/bin/env node
// Build the agent-commerce x402 USD volume payload from first-party
// Base/Solana on-chain collectors. This replaces the removed Dune script while
// preserving the data-store slug consumed by /agent-commerce.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  closeDataStore,
  readDataStore,
  writeDataStore,
} from "./_data-store-write.mjs";
import { buildX402VolumePayload } from "./_x402-volume-rollup.mjs";

const OUT_PATH = resolve(process.cwd(), ".data/dune-x402-volume.json");
const BASE_PATH = resolve(process.cwd(), ".data/base-x402-onchain.json");
const SOLANA_PATH = resolve(process.cwd(), ".data/solana-x402-onchain.json");

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function readOnchainPayload(slug, path) {
  return (await readJsonFile(path)) ?? (await readDataStore(slug));
}

async function main() {
  const fetchedAt = new Date().toISOString();
  const [base, solana] = await Promise.all([
    readOnchainPayload("base-x402-onchain", BASE_PATH),
    readOnchainPayload("solana-x402-onchain", SOLANA_PATH),
  ]);
  const payload = buildX402VolumePayload({ fetchedAt, base, solana });

  if (payload.rows.length === 0) {
    console.warn(
      "[x402-volume] no on-chain rows with real USDC amount data; preserving last-good dune-x402-volume payload",
    );
    process.exitCode = 1;
    return;
  }

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`[x402-volume] wrote ${OUT_PATH} (${payload.rows.length} rows)`);

  const ds = await writeDataStore("dune-x402-volume", payload, {
    stampPerRecord: false,
    writer: "script:build-x402-volume-from-onchain",
  });
  console.log(`[x402-volume] data-store: ${ds.source} @ ${ds.writtenAt}`);
}

main()
  .catch((err) => {
    console.error("[x402-volume] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDataStore();
  });
