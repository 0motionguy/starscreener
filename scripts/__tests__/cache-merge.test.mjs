// Tests for scripts/_cache-merge.mjs — keep-last-50 cache rule
// (docs/INGESTION.md § "RULE: Keep-last-50 cache (2026-05-08)").
//
// Run via `npm run test:scraper-shared` (covered there) or directly with
//   node --test scripts/__tests__/cache-merge.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  mergeAndKeepLastN,
  loadExistingJson,
  KEEP_LAST_N_DEFAULT,
} from "../_cache-merge.mjs";

test("KEEP_LAST_N_DEFAULT is 50", () => {
  assert.equal(KEEP_LAST_N_DEFAULT, 50);
});

test("empty existing + populated new → returns new (sliced to keepN)", () => {
  const newArr = Array.from({ length: 80 }, (_, i) => ({ id: `n${i}`, score: i }));
  const out = mergeAndKeepLastN([], newArr);
  assert.equal(out.length, 50);
  // Highest-score first.
  assert.equal(out[0].score, 79);
  assert.equal(out[49].score, 30);
});

test("populated existing + empty new (API failure) → existing untouched, never shrinks", () => {
  const existing = Array.from({ length: 30 }, (_, i) => ({ id: `e${i}`, score: i }));
  const out = mergeAndKeepLastN(existing, []);
  assert.equal(out.length, 30, "must keep all 30 existing entries");
  // All ids present.
  const ids = new Set(out.map((p) => p.id));
  for (const e of existing) assert.ok(ids.has(e.id), `missing ${e.id}`);
});

test("populated existing > keepN + empty new → trims down to keepN (floor allows shrink to 50)", () => {
  const existing = Array.from({ length: 100 }, (_, i) => ({ id: `e${i}`, score: i }));
  const out = mergeAndKeepLastN(existing, []);
  assert.equal(out.length, 50, "trims existing 100 → top 50");
  assert.equal(out[0].score, 99);
  assert.equal(out[49].score, 50);
});

test("overlap dedup keeps higher-scored version", () => {
  const existing = [
    { id: "a", score: 10 },
    { id: "b", score: 20 },
  ];
  const newArr = [
    { id: "a", score: 50 }, // higher → wins
    { id: "b", score: 5 }, // lower → existing wins
    { id: "c", score: 30 },
  ];
  const out = mergeAndKeepLastN(existing, newArr);
  const byId = Object.fromEntries(out.map((p) => [p.id, p.score]));
  assert.equal(byId.a, 50, "new higher-score wins");
  assert.equal(byId.b, 20, "existing higher-score wins");
  assert.equal(byId.c, 30, "new id added");
  assert.equal(out.length, 3);
});

test("recencyKey tiebreaks ties on score", () => {
  const existing = [];
  const newArr = [
    { id: "a", score: 10, ts: 100 },
    { id: "b", score: 10, ts: 300 },
    { id: "c", score: 10, ts: 200 },
  ];
  const out = mergeAndKeepLastN(existing, newArr, { recencyKey: "ts" });
  assert.deepEqual(
    out.map((p) => p.id),
    ["b", "c", "a"], // sorted by ts desc when score is tied
  );
});

test("custom idKey + scoreKey", () => {
  const newArr = [
    { uuid: "x", trendingScore: 5 },
    { uuid: "y", trendingScore: 10 },
    { uuid: "z", trendingScore: 1 },
  ];
  const out = mergeAndKeepLastN([], newArr, {
    idKey: "uuid",
    scoreKey: "trendingScore",
    keepN: 2,
  });
  assert.equal(out.length, 2);
  assert.equal(out[0].uuid, "y");
  assert.equal(out[1].uuid, "x");
});

test("missing id field skips the entry (defensive)", () => {
  const newArr = [
    { id: "a", score: 1 },
    { score: 999 }, // no id
    { id: null, score: 100 }, // null id
    { id: "b", score: 2 },
  ];
  const out = mergeAndKeepLastN([], newArr);
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((p) => p.id),
    ["b", "a"],
  );
});

test("non-array inputs are coerced to []", () => {
  assert.deepEqual(mergeAndKeepLastN(null, null), []);
  assert.deepEqual(mergeAndKeepLastN(undefined, undefined), []);
  assert.deepEqual(mergeAndKeepLastN({}, {}), []);
});

test("keepN floor: existing=30 + new=10 (5 overlap) → returns 35 (no shrink)", () => {
  const existing = Array.from({ length: 30 }, (_, i) => ({ id: `e${i}`, score: i }));
  const newArr = [
    // 5 overlap with higher scores
    ...Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, score: 100 + i })),
    // 5 fresh
    ...Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, score: 200 + i })),
  ];
  const out = mergeAndKeepLastN(existing, newArr);
  assert.equal(out.length, 35);
  // All 5 fresh + 5 updated overlap should be at top.
  assert.ok(out[0].score >= 200, "highest-score new entry ranks top");
});

test("loadExistingJson: missing file → fallback", async () => {
  const out = await loadExistingJson("/path/that/cannot/exist/foo.json", []);
  assert.deepEqual(out, []);
  const out2 = await loadExistingJson("/path/that/cannot/exist/foo.json", { posts: [] });
  assert.deepEqual(out2, { posts: [] });
});

test("loadExistingJson: valid file → parsed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cache-merge-test-"));
  const path = join(dir, "foo.json");
  await writeFile(path, JSON.stringify({ hello: "world", n: 7 }), "utf8");
  try {
    const out = await loadExistingJson(path, null);
    assert.deepEqual(out, { hello: "world", n: 7 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadExistingJson: corrupt JSON → fallback (does not throw)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cache-merge-test-"));
  const path = join(dir, "bad.json");
  await writeFile(path, "{not valid json", "utf8");
  try {
    const out = await loadExistingJson(path, []);
    assert.deepEqual(out, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
