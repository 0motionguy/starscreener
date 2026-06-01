import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyDuneX402VolumeStatus } from "../dune-x402-volume";

const NOW = Date.parse("2026-06-01T12:00:00.000Z");

test("classifyDuneX402VolumeStatus marks missing payload unavailable", () => {
  const result = classifyDuneX402VolumeStatus(
    null,
    { source: "missing", ageMs: 0 },
    NOW,
  );

  assert.equal(result.status, "missing");
  assert.equal(result.rowCount, 0);
  assert.equal(result.label, "volume source unavailable");
});

test("classifyDuneX402VolumeStatus marks file fallback stale even with rows", () => {
  const result = classifyDuneX402VolumeStatus(
    {
      fetchedAt: "2026-06-01T11:00:00.000Z",
      lastDay: "2026-06-01",
      rows: [{ day: "2026-06-01", facilitator: "x402.org", txCount: 1, volumeUsdc: "1" }],
    },
    { source: "file", ageMs: 0 },
    NOW,
  );

  assert.equal(result.status, "stale");
  assert.equal(result.rowCount, 1);
});

test("classifyDuneX402VolumeStatus marks recent Redis payload fresh", () => {
  const result = classifyDuneX402VolumeStatus(
    {
      fetchedAt: "2026-06-01T11:00:00.000Z",
      lastDay: "2026-06-01",
      rows: [{ day: "2026-06-01", facilitator: "x402.org", txCount: 1, volumeUsdc: "1" }],
    },
    { source: "redis", ageMs: 60_000 },
    NOW,
  );

  assert.equal(result.status, "fresh");
});

test("classifyDuneX402VolumeStatus marks old Redis payload stale", () => {
  const result = classifyDuneX402VolumeStatus(
    {
      fetchedAt: "2026-05-29T00:00:00.000Z",
      lastDay: "2026-05-29",
      rows: [{ day: "2026-05-29", facilitator: "x402.org", txCount: 1, volumeUsdc: "1" }],
    },
    { source: "redis", ageMs: 60_000 },
    NOW,
  );

  assert.equal(result.status, "stale");
});
