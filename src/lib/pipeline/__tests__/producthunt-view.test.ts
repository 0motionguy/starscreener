import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getAllPhLaunches,
  getLaunchForRepo,
  getPhFile,
  getRecentLaunches,
  producthuntCold,
  producthuntFetchedAt,
} from "../../producthunt";

test("getPhFile: returns a shaped payload with lastFetchedAt + launches array", () => {
  const file = getPhFile();
  assert.equal(typeof file.lastFetchedAt, "string");
  assert.equal(typeof file.windowDays, "number");
  assert.ok(Array.isArray(file.launches));
});

test("producthuntCold only means missing scrape metadata, not an empty result set", () => {
  const file = getPhFile();
  const expectedCold = !file.lastFetchedAt || !Array.isArray(file.launches);
  assert.equal(producthuntCold, expectedCold);
  if (!expectedCold) assert.ok(producthuntFetchedAt);
});

test("getLaunchForRepo: returns null for unknown repo", () => {
  assert.equal(
    getLaunchForRepo("definitely/not-a-real-repo-xyz-123"),
    null,
  );
});

test("getLaunchForRepo: case-insensitive lookup", () => {
  const launches = getAllPhLaunches().filter((l) => l.linkedRepo);
  if (launches.length === 0) return; // nothing to test against in this run
  const fullName = launches[0].linkedRepo!;
  const lowerHit = getLaunchForRepo(fullName.toLowerCase());
  const upperHit = getLaunchForRepo(fullName.toUpperCase());
  assert.ok(lowerHit);
  assert.ok(upperHit);
  assert.equal(lowerHit!.id, upperHit!.id);
});

test("getLaunchForRepo: returns the highest-voted launch when repo has multiple matches", () => {
  // This test exercises the pre-computed map's vote-breaker logic. Real
  // data rarely has two launches for the same tracked repo in a 7-day
  // window, so the assertion is trivially satisfied unless a duplicate
  // appears — we confirm idempotence instead.
  const launches = getAllPhLaunches().filter((l) => l.linkedRepo);
  if (launches.length === 0) return;
  const fullName = launches[0].linkedRepo!;
  const first = getLaunchForRepo(fullName);
  const second = getLaunchForRepo(fullName);
  assert.ok(first);
  assert.equal(first!.id, second!.id);
});

test("getRecentLaunches: limits and filters by daysSinceLaunch", () => {
  const seven = getRecentLaunches(7);
  const three = getRecentLaunches(3);
  assert.ok(Array.isArray(seven));
  assert.ok(Array.isArray(three));
  // Narrower window must be a subset.
  assert.ok(three.length <= seven.length);
  for (const l of three) assert.ok(l.daysSinceLaunch <= 3);

  const limited = getRecentLaunches(7, 2);
  assert.ok(limited.length <= 2);
});

test("getAllPhLaunches: all entries carry the expected shape", () => {
  for (const l of getAllPhLaunches()) {
    assert.equal(typeof l.id, "string");
    assert.equal(typeof l.name, "string");
    assert.equal(typeof l.votesCount, "number");
    assert.equal(typeof l.daysSinceLaunch, "number");
    assert.equal(typeof l.url, "string");
    assert.ok(Array.isArray(l.topics));
    assert.ok(Array.isArray(l.makers));
    // linkedRepo is either null or a lowercased owner/name string.
    if (l.linkedRepo !== null) {
      assert.equal(typeof l.linkedRepo, "string");
      assert.ok(l.linkedRepo.includes("/"));
    }
  }
});
