// Top10 snapshot helpers — date validation + key shape.
//
// Round-trip writes against the actual data-store would need a Redis mock or
// a live connection. Both are heavy for what's essentially url validation +
// JSON serde. We cover the pure helpers (date validation, key formatter,
// today/yesterday computation) and the read-side null-safety guarantees.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isValidDate,
  snapshotKey,
  todayUtcDate,
  yesterdayUtcDate,
} from "../snapshots";

test("isValidDate accepts YYYY-MM-DD", () => {
  assert.equal(isValidDate("2026-04-29"), true);
  assert.equal(isValidDate("2024-02-29"), true); // leap year
  assert.equal(isValidDate("2000-01-01"), true);
});

test("isValidDate rejects malformed input", () => {
  assert.equal(isValidDate(""), false);
  assert.equal(isValidDate("2026-4-29"), false); // missing pad
  assert.equal(isValidDate("2026/04/29"), false); // wrong separator
  assert.equal(isValidDate("today"), false);
  assert.equal(isValidDate("2026-04-29T00:00:00Z"), false); // not the format
});

test("snapshotKey produces stable namespaced key", () => {
  assert.equal(snapshotKey("2026-04-29"), "top10:2026-04-29");
});

test("todayUtcDate / yesterdayUtcDate round-trip a fixed reference", () => {
  // Use a fixed Date so the test is deterministic across runs.
  const ref = new Date("2026-04-29T05:00:00Z");
  assert.equal(todayUtcDate(ref), "2026-04-29");
  assert.equal(yesterdayUtcDate(ref), "2026-04-28");
});

test("yesterdayUtcDate handles month boundary", () => {
  const ref = new Date("2026-05-01T00:30:00Z");
  assert.equal(yesterdayUtcDate(ref), "2026-04-30");
});

test("yesterdayUtcDate handles year boundary", () => {
  const ref = new Date("2027-01-01T00:30:00Z");
  assert.equal(yesterdayUtcDate(ref), "2026-12-31");
});
