// Unit tests for the pure recent-drops helpers (NEW-window select + merge/cap).
//
// The data-store-backed read/write path (recordRecentDrop / refresh) is covered
// by data-store.test.ts; here we lock the windowing + dedupe/cap logic that
// drives the ticker / featured / trending NEW badges, with no singleton or disk.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  selectNewFullNames,
  mergeRecentDrops,
  type RecentDrop,
} from "../recent-drops";

function drop(fullName: string, listedAt: string): RecentDrop {
  const [owner, name] = fullName.split("/", 2);
  return { fullName, owner, name, listedAt };
}

const NOW = Date.parse("2026-05-28T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

test("selectNewFullNames includes drops within the window, lowercased", () => {
  const drops = [
    drop("Vercel/Next.js", new Date(NOW - 1 * HOUR).toISOString()),
    drop("openai/codex", new Date(NOW - 23 * HOUR).toISOString()),
  ];
  const set = selectNewFullNames(drops, 24 * HOUR, NOW);
  assert.ok(set.has("vercel/next.js"));
  assert.ok(set.has("openai/codex"));
  assert.equal(set.size, 2);
});

test("selectNewFullNames excludes drops older than the window", () => {
  const drops = [
    drop("old/repo", new Date(NOW - 25 * HOUR).toISOString()),
    drop("fresh/repo", new Date(NOW - 1 * HOUR).toISOString()),
  ];
  const set = selectNewFullNames(drops, 24 * HOUR, NOW);
  assert.ok(!set.has("old/repo"));
  assert.ok(set.has("fresh/repo"));
});

test("selectNewFullNames skips unparseable timestamps", () => {
  const set = selectNewFullNames([drop("bad/ts", "not-a-date")], 24 * HOUR, NOW);
  assert.equal(set.size, 0);
});

test("mergeRecentDrops prepends newest and dedupes case-insensitively", () => {
  const prev = [
    drop("a/one", new Date(NOW - 2 * HOUR).toISOString()),
    drop("b/two", new Date(NOW - 3 * HOUR).toISOString()),
  ];
  const next = drop("A/One", new Date(NOW).toISOString());
  const merged = mergeRecentDrops(prev, next, 20);
  assert.equal(merged.length, 2); // A/One replaces a/one
  assert.equal(merged[0].fullName, "A/One"); // newest first
  assert.equal(merged[1].fullName, "b/two");
});

test("mergeRecentDrops caps at max, newest kept and oldest dropped", () => {
  const prev = Array.from({ length: 20 }, (_, i) =>
    drop(`o/r${i}`, new Date(NOW - (i + 1) * HOUR).toISOString()),
  );
  const next = drop("new/one", new Date(NOW).toISOString());
  const merged = mergeRecentDrops(prev, next, 20);
  assert.equal(merged.length, 20);
  assert.equal(merged[0].fullName, "new/one");
  assert.ok(!merged.some((d) => d.fullName === "o/r19")); // oldest evicted
});
