import assert from "node:assert/strict";
import { test } from "node:test";

import { buildX402VolumePayload } from "../_x402-volume-rollup.mjs";

test("buildX402VolumePayload emits Dune-compatible rows from real on-chain volume", () => {
  const payload = buildX402VolumePayload({
    fetchedAt: "2026-06-01T12:00:00.000Z",
    base: {
      byDay: {
        "2026-06-01": {
          txs: 2,
          byFacilitator: {
            Coinbase: { txs: 2, volumeUsdc: "1.25" },
            LegacyCountOnly: 3,
          },
        },
      },
    },
    solana: {
      byDay: {
        "2026-06-01": {
          txs: 1,
          byFacilitator: {
            CodeNut: { txs: 1, volumeUsdc: "0.50" },
          },
        },
      },
    },
  });

  assert.equal(payload.fetchedAt, "2026-06-01T12:00:00.000Z");
  assert.equal(payload.source, "x402-onchain-rollup");
  assert.equal(payload.lastDay, "2026-06-01");
  assert.deepEqual(payload.rows, [
    {
      day: "2026-06-01",
      chain: "base",
      facilitator: "Coinbase",
      txCount: 2,
      volumeUsdc: "1.25",
    },
    {
      day: "2026-06-01",
      chain: "solana",
      facilitator: "CodeNut",
      txCount: 1,
      volumeUsdc: "0.50",
    },
  ]);
});
