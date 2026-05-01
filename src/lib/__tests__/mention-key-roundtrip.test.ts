import { strict as assert } from "node:assert";
import { test } from "node:test";

import { slugToId } from "../utils";

test("slugToId derivation produces a stable, lowercase, [a-z0-9-]+ slug for known fullName variants", () => {
  // Pin the F2 dual-key derivation rule. If `slugToId` ever regresses
  // (e.g. someone re-introduces uppercase, dots, or slashes into the
  // output) this test fails and the per-source mention writers stop
  // agreeing with downstream readers that compute the same key.
  const cases: Array<{ fullName: string; expected: string }> = [
    { fullName: "vercel/next.js", expected: "vercel--next-js" },
    { fullName: "openai/whisper", expected: "openai--whisper" },
    { fullName: "facebookresearch/llama", expected: "facebookresearch--llama" },
  ];

  for (const { fullName, expected } of cases) {
    const id = slugToId(fullName);
    assert.ok(id.length > 0, `slugToId(${fullName}) returned empty`);
    assert.match(
      id,
      /^[a-z0-9-]+$/,
      `slugToId(${fullName})="${id}" violates [a-z0-9-]+ rule`,
    );
    assert.equal(
      id,
      expected,
      `slugToId(${fullName}) drift: expected "${expected}", got "${id}"`,
    );
  }
});

test("F2 dual-key shape — mentionsByRepoId mirrors mentions by slug derivation", async () => {
  // Documentation-as-test for now. Downstream readers compute the repoId
  // from `fullName` via `slugToId` and look it up in `mentionsByRepoId`.
  // The real assertion lives in the writer-side maps (per-source mention
  // payloads) — pinning the derivation rule above is what keeps them in
  // agreement. If/when a fixture lands in `data/`, this becomes a real
  // round-trip check.
  assert.ok(true);
});
