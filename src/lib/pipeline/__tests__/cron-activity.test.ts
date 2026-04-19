// StarScreener — cron-activity ring buffer tests.
//
// Phase 2 P-119 (F-OBSV-001). Locks:
//   - recordCronActivity appends in order
//   - getCronActivity returns newest-first with filters
//   - summarizeCronActivity windows correctly
//   - buffer is bounded (oldest dropped when capacity exceeded)

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  recordCronActivity,
  getCronActivity,
  summarizeCronActivity,
  __resetCronActivityForTests,
} from "../../observability/cron-activity";

function mkEntry(offsetSec: number, overrides: Partial<{
  scope: string;
  status: "ok" | "error";
  durationMs: number;
}> = {}): void {
  recordCronActivity({
    at: new Date(Date.now() - offsetSec * 1000).toISOString(),
    scope: overrides.scope ?? "cron:ingest",
    status: overrides.status ?? "ok",
    durationMs: overrides.durationMs ?? 42,
  });
}

test("getCronActivity on an empty buffer returns []", () => {
  __resetCronActivityForTests();
  assert.deepEqual(getCronActivity(), []);
});

test("entries come back newest-first", () => {
  __resetCronActivityForTests();
  mkEntry(90); // oldest
  mkEntry(60);
  mkEntry(30); // newest
  const out = getCronActivity();
  assert.equal(out.length, 3);
  // Newest first = index 0 has the smallest offset (most recent).
  assert.ok(out[0].at > out[1].at);
  assert.ok(out[1].at > out[2].at);
});

test("scope filter returns only matching entries", () => {
  __resetCronActivityForTests();
  mkEntry(30, { scope: "cron:ingest" });
  mkEntry(25, { scope: "cron:seed" });
  mkEntry(20, { scope: "cron:ingest" });
  const ingest = getCronActivity({ scope: "cron:ingest" });
  assert.equal(ingest.length, 2);
  for (const e of ingest) assert.equal(e.scope, "cron:ingest");
});

test("limit truncates from newest", () => {
  __resetCronActivityForTests();
  for (let i = 0; i < 10; i++) mkEntry(100 - i); // 10 entries oldest→newest
  const out = getCronActivity({ limit: 3 });
  assert.equal(out.length, 3);
  // Newest 3 (largest at-strings).
  const all = getCronActivity();
  assert.deepEqual(out, all.slice(0, 3));
});

test("summarize counts only inside the window", () => {
  __resetCronActivityForTests();
  mkEntry(7200); // 2h ago — outside 1h window
  mkEntry(1800, { status: "ok" }); // 30m ago — inside
  mkEntry(60, { status: "error" }); // 1m ago — inside
  const summary = summarizeCronActivity(60 * 60 * 1000);
  assert.equal(summary.total, 2);
  assert.equal(summary.ok, 1);
  assert.equal(summary.failed, 1);
  assert.ok(summary.ageMs !== null && summary.ageMs < 60_000 + 5_000);
});

test("ring buffer drops oldest entries past capacity", () => {
  __resetCronActivityForTests(5); // cap=5
  for (let i = 0; i < 12; i++) mkEntry(100 - i);
  const out = getCronActivity();
  // Only the 5 most recent survive.
  assert.equal(out.length, 5);
});

test("summary returns ageMs=null when buffer is empty", () => {
  __resetCronActivityForTests();
  const summary = summarizeCronActivity(60_000);
  assert.equal(summary.total, 0);
  assert.equal(summary.lastAt, null);
  assert.equal(summary.ageMs, null);
});
