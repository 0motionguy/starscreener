// Tests for the freshness endpoint contract and the getFreshnessSnapshot
// helper it wraps. The route itself is thin (validate + read in-memory
// snapshot), so most coverage sits on the snapshot builder.
//
// Run with: npx tsx --test src/lib/pipeline/__tests__/freshness-endpoint.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FAST_DATA_STALE_THRESHOLD_MS,
  evaluateSourceFreshness,
  getFreshnessSnapshot,
  type FreshnessSnapshot,
} from "../../source-health";

// The snapshot reads in-process scraper state set up by the test harness
// at import time. We don't mutate it here — we only assert invariants
// that must hold regardless of what the scrapers happen to have loaded.

test("getFreshnessSnapshot: returns all eight expected source keys", () => {
  const snap = getFreshnessSnapshot();

  const expected: (keyof FreshnessSnapshot["sources"])[] = [
    "reddit",
    "hackernews",
    "bluesky",
    "devto",
    "producthunt",
    "twitter",
    "npm",
    "github",
  ];

  for (const key of expected) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(snap.sources, key),
      `missing source key: ${key}`,
    );
    const entry = snap.sources[key];
    assert.ok(entry, `entry for ${key} should be defined`);
    // lastScanAt is either null or an ISO string.
    if (entry.lastScanAt !== null) {
      assert.ok(
        !Number.isNaN(Date.parse(entry.lastScanAt)),
        `lastScanAt for ${key} must parse: ${entry.lastScanAt}`,
      );
    }
    // ageMs null iff lastScanAt null (cold/never-scanned).
    if (entry.lastScanAt === null) {
      assert.equal(entry.ageMs, null);
      assert.equal(entry.stale, false);
    } else {
      assert.ok(typeof entry.ageMs === "number");
      assert.ok((entry.ageMs as number) >= 0);
      assert.equal(typeof entry.stale, "boolean");
    }
  }
});

test("getFreshnessSnapshot: never-scanned sources have null lastScanAt + ageMs + stale=false", () => {
  const snap = getFreshnessSnapshot();

  // twitter and github are not tracked by source-health yet, so they
  // are guaranteed never-scanned in the current codebase.
  const twitter = snap.sources.twitter;
  const github = snap.sources.github;

  for (const [label, entry] of [
    ["twitter", twitter],
    ["github", github],
  ] as const) {
    assert.equal(entry.lastScanAt, null, `${label} lastScanAt`);
    assert.equal(entry.ageMs, null, `${label} ageMs`);
    assert.equal(entry.stale, false, `${label} stale`);
  }
});

test("getFreshnessSnapshot: fetchedAt is a recent ISO timestamp", () => {
  const before = Date.now();
  const snap = getFreshnessSnapshot();
  const after = Date.now();

  const ts = Date.parse(snap.fetchedAt);
  assert.ok(!Number.isNaN(ts), "fetchedAt must be ISO-parseable");
  assert.ok(ts >= before - 1000 && ts <= after + 1000, "fetchedAt within call window");
});

test("getFreshnessSnapshot: stale flag matches threshold constants", () => {
  // Pin "now" to an hour arbitrary so we don't race the clock.
  const now = Date.parse("2030-01-01T12:00:00.000Z");
  const snap = getFreshnessSnapshot(now);

  // Any non-null entry's stale flag must equal the comparison we'd do
  // against that source's threshold. Reddit uses FAST_DATA (2h), so we
  // cross-check the math via evaluateSourceFreshness too to catch drift.
  const reddit = snap.sources.reddit;
  if (reddit.lastScanAt && reddit.ageMs !== null) {
    const viaEvaluator = evaluateSourceFreshness({
      fetchedAt: reddit.lastScanAt,
      cold: false,
      staleAfterMs: FAST_DATA_STALE_THRESHOLD_MS,
      degradedAfterMs: 45 * 60 * 1000,
      nowMs: now,
    });
    assert.equal(reddit.stale, viaEvaluator.stale);
  }
});

test("GET /api/repos/[owner]/[name]/freshness: rejects bad slugs with 400", async () => {
  const { GET } = await import("../../../app/api/repos/[owner]/[name]/freshness/route");

  const req = new Request("http://localhost/api/repos/bad%20owner/name/freshness");
  const res = await GET(req as never, {
    params: Promise.resolve({ owner: "bad owner", name: "name" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error?: string };
  assert.equal(body.error, "Invalid repo slug");

  const req2 = new Request("http://localhost/api/repos/owner/bad..name/freshness");
  // "bad..name" still matches [A-Za-z0-9._-]+ so it's NOT a slug-regex
  // failure — use a path-traversal attempt instead to exercise the 400.
  const res2 = await GET(req2 as never, {
    params: Promise.resolve({ owner: "owner", name: "bad/name" }),
  });
  assert.equal(res2.status, 400);
});

test("GET /api/repos/[owner]/[name]/freshness: returns 404 for unknown repo", async () => {
  const { GET } = await import("../../../app/api/repos/[owner]/[name]/freshness/route");

  const req = new Request(
    "http://localhost/api/repos/this-owner-definitely/does-not-exist-xyz/freshness",
  );
  const res = await GET(req as never, {
    params: Promise.resolve({
      owner: "this-owner-definitely",
      name: "does-not-exist-xyz",
    }),
  });
  assert.equal(res.status, 404);
});
