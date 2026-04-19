// StarScreener Pipeline — SnapshotStore.totalCount() invariants.
//
// Phase 2 P-114 (F-PERF-001). Replaces the O(N*M) walk in
// /api/pipeline/status with an O(1) counter maintained by append/clear.
// These tests lock the invariant: totalCount always equals the exact
// number of snapshots currently retained across every repo.

import { test } from "node:test";
import assert from "node:assert/strict";

import { InMemorySnapshotStore } from "../storage/memory-stores";
import type { RepoSnapshot } from "../types";

function mk(
  repoId: string,
  capturedAt: string,
  source: RepoSnapshot["source"] = "mock",
): RepoSnapshot {
  return {
    id: `${repoId}:${capturedAt}:${source}`,
    repoId,
    capturedAt,
    source,
    stars: 100,
    forks: 10,
    contributors: 5,
    openIssues: 3,
    ownerAvatarUrl: "",
    description: null,
    topics: [],
    language: null,
    url: "https://github.com/fake/fake",
    name: "fake",
    owner: "fake",
    fullName: `${repoId.replace("--", "/")}`,
    createdAt: capturedAt,
    lastCommitAt: null,
    lastReleaseAt: null,
    lastReleaseTag: null,
  } as unknown as RepoSnapshot;
}

test("fresh SnapshotStore reports totalCount === 0", () => {
  const s = new InMemorySnapshotStore();
  assert.equal(s.totalCount(), 0);
});

test("totalCount tracks unique appends across repos", () => {
  const s = new InMemorySnapshotStore();
  s.append(mk("acme--a", "2026-04-19T00:00:00Z"));
  s.append(mk("acme--a", "2026-04-18T00:00:00Z"));
  s.append(mk("acme--b", "2026-04-19T00:00:00Z"));
  assert.equal(s.totalCount(), 3);
});

test("re-appending the same id is a no-op for the count (dedup)", () => {
  const s = new InMemorySnapshotStore();
  const snap = mk("acme--a", "2026-04-19T00:00:00Z");
  s.append(snap);
  s.append(snap); // same id → dedup
  assert.equal(s.totalCount(), 1);
});

test("clear(repoId) subtracts exactly that repo's snapshots", () => {
  const s = new InMemorySnapshotStore();
  s.append(mk("acme--a", "2026-04-19T00:00:00Z"));
  s.append(mk("acme--a", "2026-04-18T00:00:00Z"));
  s.append(mk("acme--b", "2026-04-19T00:00:00Z"));
  assert.equal(s.totalCount(), 3);

  s.clear("acme--a");
  assert.equal(s.totalCount(), 1);

  s.clear("never-existed");
  assert.equal(s.totalCount(), 1);
});

test("clear() with no arg resets totalCount to 0", () => {
  const s = new InMemorySnapshotStore();
  for (let i = 0; i < 5; i++) {
    s.append(mk("acme--a", `2026-04-${10 + i}T00:00:00Z`));
  }
  assert.equal(s.totalCount(), 5);
  s.clear();
  assert.equal(s.totalCount(), 0);
});

test("totalCount stays consistent across retention-cap evictions", () => {
  const s = new InMemorySnapshotStore();
  // SNAPSHOT_HISTORY_CAP is 120 in memory-stores.ts; append 130 so the cap
  // evicts the oldest. Count must equal the cap, not 130.
  for (let i = 0; i < 130; i++) {
    const ts = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
    s.append(mk("acme--a", ts));
  }
  assert.equal(s.totalCount(), 120);
});
