// Verifies the scheduler decision in .github/workflows/sync-trustmrr.yml
// matches the "Decide mode" block comment there. The workflow calls the
// same selector via its inlined bash case; if the two ever drift, this
// test catches it and prompts an explicit doc update.

import assert from "node:assert/strict";
import { test } from "node:test";

import { selectTrustmrrSyncMode } from "../_trustmrr.mjs";

test("02:27 UTC schedule run → full catalog sweep", () => {
  assert.equal(
    selectTrustmrrSyncMode({ eventName: "schedule", hourUtc: 2 }),
    "full",
  );
});

test("every other schedule hour → incremental (no API calls)", () => {
  for (const hour of [0, 1, 3, 5, 8, 12, 14, 17, 20, 23]) {
    assert.equal(
      selectTrustmrrSyncMode({ eventName: "schedule", hourUtc: hour }),
      "incremental",
      `hour ${hour} should be incremental, not full`,
    );
  }
});

test("workflow_dispatch respects the input when valid", () => {
  assert.equal(
    selectTrustmrrSyncMode({
      eventName: "workflow_dispatch",
      hourUtc: 2,
      dispatchInput: "full",
    }),
    "full",
  );
  assert.equal(
    selectTrustmrrSyncMode({
      eventName: "workflow_dispatch",
      hourUtc: 2,
      dispatchInput: "incremental",
    }),
    "incremental",
  );
});

test("workflow_dispatch with missing/unknown input defaults to incremental", () => {
  assert.equal(
    selectTrustmrrSyncMode({ eventName: "workflow_dispatch", hourUtc: 14 }),
    "incremental",
  );
  assert.equal(
    selectTrustmrrSyncMode({
      eventName: "workflow_dispatch",
      hourUtc: 14,
      dispatchInput: "bogus",
    }),
    "incremental",
  );
});
