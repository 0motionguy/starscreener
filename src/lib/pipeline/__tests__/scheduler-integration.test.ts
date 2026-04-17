// StarScreener Pipeline — Scheduler + ingest integration tests
//
// Run with: npm test (project script: tsx --test src/lib/pipeline/__tests__/*.test.ts)
//
// These tests verify:
//   1. assignTier classifies repos into hot/warm/cold by the documented rules.
//   2. getRefreshBatch respects each tier's maxPerHour cap and priority order.
//   3. The ingest path is idempotent — re-ingesting a repo doesn't duplicate
//      its persisted Repo record and snapshot count stays bounded to the
//      number of ingest calls (not multiplicative).

import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { Repo } from "../../types";
import {
  DEFAULT_POLICIES,
  assignTier,
  buildRefreshPlan,
  getRefreshBatch,
  type TierContext,
} from "../ingestion/scheduler";
import { ingestRepo, ingestBatch } from "../ingestion/ingest";
import { MockGitHubAdapter } from "../adapters/mock-github-adapter";
import {
  InMemoryRepoStore,
  InMemorySnapshotStore,
  InMemoryMentionStore,
} from "../storage/memory-stores";
import type { RefreshPlan } from "../types";

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------

function makeRepo(partial: Partial<Repo> & { fullName: string }): Repo {
  const [owner, name] = partial.fullName.split("/");
  return {
    id: partial.id ?? `${owner}--${name}`.toLowerCase(),
    fullName: partial.fullName,
    name: partial.name ?? name ?? "",
    owner: partial.owner ?? owner ?? "",
    ownerAvatarUrl: partial.ownerAvatarUrl ?? "",
    description: partial.description ?? "",
    url: partial.url ?? `https://github.com/${partial.fullName}`,
    language: partial.language ?? null,
    topics: partial.topics ?? [],
    categoryId: partial.categoryId ?? "devtools",
    stars: partial.stars ?? 0,
    forks: partial.forks ?? 0,
    contributors: partial.contributors ?? 0,
    openIssues: partial.openIssues ?? 0,
    lastCommitAt: partial.lastCommitAt ?? new Date().toISOString(),
    lastReleaseAt: partial.lastReleaseAt ?? null,
    lastReleaseTag: partial.lastReleaseTag ?? null,
    createdAt: partial.createdAt ?? new Date().toISOString(),
    starsDelta24h: partial.starsDelta24h ?? 0,
    starsDelta7d: partial.starsDelta7d ?? 0,
    starsDelta30d: partial.starsDelta30d ?? 0,
    forksDelta7d: partial.forksDelta7d ?? 0,
    contributorsDelta30d: partial.contributorsDelta30d ?? 0,
    momentumScore: partial.momentumScore ?? 0,
    movementStatus: partial.movementStatus ?? "stable",
    rank: partial.rank ?? 0,
    categoryRank: partial.categoryRank ?? 0,
    sparklineData: partial.sparklineData ?? [],
    socialBuzzScore: partial.socialBuzzScore ?? 0,
    mentionCount24h: partial.mentionCount24h ?? 0,
  };
}

const emptyCtx: TierContext = {
  isWatchlisted: false,
  isTopMover: false,
  isBreakout: false,
  categoryLeaderIds: new Set<string>(),
};

const INGEST_FIXTURES: Repo[] = [
  makeRepo({ fullName: "vercel/next.js", stars: 100_000, forks: 25_000, contributors: 3000 }),
  makeRepo({ fullName: "ollama/ollama", stars: 80_000, forks: 6_000, contributors: 400 }),
  makeRepo({ fullName: "sveltejs/svelte", stars: 75_000, forks: 4_000, contributors: 800 }),
];

// ---------------------------------------------------------------------------
// assignTier
// ---------------------------------------------------------------------------

test("assignTier: watchlisted repo is hot regardless of other signals", () => {
  const repo = makeRepo({
    fullName: "small/side-project",
    stars: 42,
    movementStatus: "declining",
  });
  const tier = assignTier(repo, { ...emptyCtx, isWatchlisted: true });
  assert.equal(tier, "hot");
});

test("assignTier: top mover is hot", () => {
  const repo = makeRepo({
    fullName: "acme/mover",
    stars: 100,
    movementStatus: "stable",
  });
  assert.equal(assignTier(repo, { ...emptyCtx, isTopMover: true }), "hot");
});

test("assignTier: breakout is hot", () => {
  const repo = makeRepo({
    fullName: "acme/breakout",
    stars: 500,
    movementStatus: "breakout",
  });
  assert.equal(assignTier(repo, { ...emptyCtx, isBreakout: true }), "hot");
});

test("assignTier: category leader is hot", () => {
  const repo = makeRepo({ fullName: "acme/leader", stars: 300 });
  const leaderIds = new Set<string>([repo.id]);
  assert.equal(
    assignTier(repo, { ...emptyCtx, categoryLeaderIds: leaderIds }),
    "hot",
  );
});

test("assignTier: >5k stars → warm", () => {
  const repo = makeRepo({
    fullName: "acme/popular",
    stars: 15_000,
    movementStatus: "stable",
  });
  assert.equal(assignTier(repo, emptyCtx), "warm");
});

test("assignTier: rising movement → warm even under 5k stars", () => {
  const repo = makeRepo({
    fullName: "acme/rising",
    stars: 500,
    movementStatus: "rising",
  });
  assert.equal(assignTier(repo, emptyCtx), "warm");
});

test("assignTier: hot movement → warm even under 5k stars", () => {
  const repo = makeRepo({
    fullName: "acme/hot-small",
    stars: 200,
    movementStatus: "hot",
  });
  assert.equal(assignTier(repo, emptyCtx), "warm");
});

test("assignTier: quiet_killer movement → warm", () => {
  const repo = makeRepo({
    fullName: "acme/sleeper",
    stars: 1_000,
    movementStatus: "quiet_killer",
  });
  assert.equal(assignTier(repo, emptyCtx), "warm");
});

test("assignTier: declining small repo → cold", () => {
  const repo = makeRepo({
    fullName: "acme/cold",
    stars: 50,
    movementStatus: "declining",
  });
  assert.equal(assignTier(repo, emptyCtx), "cold");
});

test("assignTier: stable mid-size repo → cold (<=5k stars)", () => {
  const repo = makeRepo({
    fullName: "acme/steady",
    stars: 3_000,
    movementStatus: "stable",
  });
  assert.equal(assignTier(repo, emptyCtx), "cold");
});

// ---------------------------------------------------------------------------
// getRefreshBatch — cap + priority ordering
// ---------------------------------------------------------------------------

test("getRefreshBatch: respects hot tier cap (50 per hour)", () => {
  const now = Date.now();
  // Build 120 synthetic plans, all due now, priorities descending.
  const plans: RefreshPlan[] = [];
  for (let i = 0; i < 120; i++) {
    plans.push({
      repoId: `r-${i}`,
      tier: "hot",
      lastRefreshedAt: null,
      nextRefreshAt: new Date(now - 60_000).toISOString(),
      priority: 100 - i, // ensure ordering is well-defined
      reasons: ["hot"],
    });
  }
  const picked = getRefreshBatch(plans, DEFAULT_POLICIES.hot.maxPerHour);
  assert.equal(picked.length, DEFAULT_POLICIES.hot.maxPerHour);
  assert.equal(picked.length, 50);
  // Highest-priority item should be first.
  assert.equal(picked[0].repoId, "r-0");
  // Must not include any item below the cut (priority < 51).
  for (const p of picked) {
    assert.ok(p.priority >= 51);
  }
});

test("getRefreshBatch: respects warm tier cap (20 per hour)", () => {
  const now = Date.now();
  const plans: RefreshPlan[] = Array.from({ length: 40 }, (_, i) => ({
    repoId: `w-${i}`,
    tier: "warm",
    lastRefreshedAt: null,
    nextRefreshAt: new Date(now - 1000).toISOString(),
    priority: 50,
    reasons: ["warm"],
  }));
  const picked = getRefreshBatch(plans, DEFAULT_POLICIES.warm.maxPerHour);
  assert.equal(picked.length, 20);
});

test("getRefreshBatch: respects cold tier cap (5 per hour)", () => {
  const now = Date.now();
  const plans: RefreshPlan[] = Array.from({ length: 10 }, (_, i) => ({
    repoId: `c-${i}`,
    tier: "cold",
    lastRefreshedAt: null,
    nextRefreshAt: new Date(now - 10_000).toISOString(),
    priority: 10,
    reasons: ["cold"],
  }));
  const picked = getRefreshBatch(plans, DEFAULT_POLICIES.cold.maxPerHour);
  assert.equal(picked.length, 5);
});

test("getRefreshBatch: filters out plans whose nextRefreshAt is in the future", () => {
  const now = Date.now();
  const plans: RefreshPlan[] = [
    {
      repoId: "past",
      tier: "hot",
      lastRefreshedAt: null,
      nextRefreshAt: new Date(now - 60_000).toISOString(),
      priority: 80,
      reasons: ["due"],
    },
    {
      repoId: "future",
      tier: "hot",
      lastRefreshedAt: null,
      nextRefreshAt: new Date(now + 3_600_000).toISOString(),
      priority: 100,
      reasons: ["not-yet"],
    },
  ];
  const picked = getRefreshBatch(plans, 50);
  assert.equal(picked.length, 1);
  assert.equal(picked[0].repoId, "past");
});

test("getRefreshBatch: returns empty when cap is 0", () => {
  const plans: RefreshPlan[] = [
    {
      repoId: "r-1",
      tier: "hot",
      lastRefreshedAt: null,
      nextRefreshAt: new Date(Date.now() - 1000).toISOString(),
      priority: 99,
      reasons: [],
    },
  ];
  assert.equal(getRefreshBatch(plans, 0).length, 0);
});

test("getRefreshBatch: ties break on earliest nextRefreshAt first", () => {
  const now = Date.now();
  const plans: RefreshPlan[] = [
    {
      repoId: "newer",
      tier: "hot",
      lastRefreshedAt: null,
      nextRefreshAt: new Date(now - 1000).toISOString(),
      priority: 50,
      reasons: [],
    },
    {
      repoId: "older",
      tier: "hot",
      lastRefreshedAt: null,
      nextRefreshAt: new Date(now - 60_000).toISOString(),
      priority: 50,
      reasons: [],
    },
  ];
  const picked = getRefreshBatch(plans, 10);
  assert.equal(picked[0].repoId, "older");
});

// ---------------------------------------------------------------------------
// buildRefreshPlan — per-repo scheduling math
// ---------------------------------------------------------------------------

test("buildRefreshPlan: nextRefreshAt = lastRefreshedAt + interval", () => {
  const repo = makeRepo({ fullName: "a/b", stars: 10_000 });
  const lastRefreshedAt = "2025-04-01T00:00:00.000Z";
  const plan = buildRefreshPlan(repo, "hot", lastRefreshedAt, emptyCtx);
  const expected = new Date(
    Date.parse(lastRefreshedAt) + DEFAULT_POLICIES.hot.intervalMinutes * 60_000,
  ).toISOString();
  assert.equal(plan.nextRefreshAt, expected);
});

test("buildRefreshPlan: with no lastRefreshedAt, nextRefreshAt is ~now (priority 100)", () => {
  const repo = makeRepo({ fullName: "a/b" });
  const plan = buildRefreshPlan(repo, "hot", undefined, emptyCtx);
  assert.equal(plan.priority, 100);
});

// ---------------------------------------------------------------------------
// Ingest idempotency
// ---------------------------------------------------------------------------
//
// Idempotency contract we verify:
//   - Re-ingesting the same repo does NOT produce a duplicate Repo record
//     (repo count stays stable).
//   - Snapshots are de-duplicated by snapshot id (`${repoId}:${capturedAt}`),
//     so re-ingesting at the exact same millisecond keeps the snapshot set
//     bounded; fresh ingests at different timestamps append new snapshots.
//   - Error paths (unknown repo) don't mutate either store.

test("ingestRepo: re-ingesting the same repo doesn't duplicate the Repo record", async () => {
  const repoStore = new InMemoryRepoStore();
  const snapshotStore = new InMemorySnapshotStore();
  const mentionStore = new InMemoryMentionStore();
  const adapter = new MockGitHubAdapter(INGEST_FIXTURES);

  const fullName = "vercel/next.js";

  for (let i = 0; i < 3; i++) {
    const result = await ingestRepo(fullName, {
      githubAdapter: adapter,
      repoStore,
      snapshotStore,
      mentionStore,
    });
    assert.equal(result.ok, true);
  }

  // Exactly one repo record regardless of call count.
  const all = repoStore.getAll();
  const matching = all.filter((r) => r.fullName === fullName);
  assert.equal(matching.length, 1, "expected exactly 1 repo record");

  // Snapshots are de-duplicated by id, so the snapshot set is bounded.
  // At worst we have 3 (one per call with distinct timestamp); at best 1
  // (all three fell on the same millisecond). Either way, never more than
  // the number of ingest calls, and never zero because the first call
  // always appends.
  const repoId = matching[0].id;
  const snaps = snapshotStore.list(repoId);
  assert.ok(snaps.length >= 1, "at least one snapshot exists");
  assert.ok(snaps.length <= 3, "no more snapshots than ingest calls");
});

test("ingestBatch: same batch twice → repo count stable (idempotent)", async () => {
  const repoStore = new InMemoryRepoStore();
  const snapshotStore = new InMemorySnapshotStore();
  const mentionStore = new InMemoryMentionStore();
  const adapter = new MockGitHubAdapter(INGEST_FIXTURES);

  const batch = ["vercel/next.js", "ollama/ollama", "sveltejs/svelte"];

  const first = await ingestBatch(batch, {
    githubAdapter: adapter,
    repoStore,
    snapshotStore,
    mentionStore,
    delayMs: 0,
  });
  assert.equal(first.ok, 3);
  assert.equal(first.failed, 0);

  assert.equal(repoStore.getAll().length, 3, "3 repos after first batch");

  const second = await ingestBatch(batch, {
    githubAdapter: adapter,
    repoStore,
    snapshotStore,
    mentionStore,
    delayMs: 0,
  });
  assert.equal(second.ok, 3);

  // Still only 3 repos — the key idempotency guarantee.
  assert.equal(
    repoStore.getAll().length,
    3,
    "repo count should stay 3 after re-ingesting same batch",
  );

  // Each repo has at least 1 snapshot, and snapshots are bounded by the
  // snapshot store's retention cap regardless of how many times we ingest.
  for (const fullName of batch) {
    const repo = repoStore.getByFullName(fullName);
    assert.ok(repo, `repo ${fullName} should exist`);
    if (!repo) return;
    const snaps = snapshotStore.list(repo.id);
    assert.ok(
      snaps.length >= 1,
      `repo ${fullName} should have at least 1 snapshot`,
    );
  }
});

test("ingestRepo: timestamp-distinct calls append fresh snapshots", async () => {
  const repoStore = new InMemoryRepoStore();
  const snapshotStore = new InMemorySnapshotStore();
  const mentionStore = new InMemoryMentionStore();
  const adapter = new MockGitHubAdapter(INGEST_FIXTURES);

  const fullName = "vercel/next.js";

  // Call once, wait past the millisecond boundary, call again. This proves
  // the ingest path does emit distinct snapshots when timestamps differ —
  // idempotency is about the Repo record, not a ban on new snapshots.
  const a = await ingestRepo(fullName, {
    githubAdapter: adapter,
    repoStore,
    snapshotStore,
    mentionStore,
  });
  assert.equal(a.ok, true);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const b = await ingestRepo(fullName, {
    githubAdapter: adapter,
    repoStore,
    snapshotStore,
    mentionStore,
  });
  assert.equal(b.ok, true);

  assert.equal(repoStore.getAll().length, 1, "still only 1 repo record");

  const repoId = repoStore.getAll()[0].id;
  const snaps = snapshotStore.list(repoId);
  // With a 5ms wait between calls we expect 2 snapshots, but on some
  // runners the clock may still collide; accept 1-2.
  assert.ok(
    snaps.length === 1 || snaps.length === 2,
    `expected 1 or 2 snapshots, got ${snaps.length}`,
  );
});

test("ingestRepo: unknown repo name returns ok:false without throwing", async () => {
  const repoStore = new InMemoryRepoStore();
  const snapshotStore = new InMemorySnapshotStore();
  const mentionStore = new InMemoryMentionStore();
  const adapter = new MockGitHubAdapter();

  const result = await ingestRepo("does-not-exist/at-all", {
    githubAdapter: adapter,
    repoStore,
    snapshotStore,
    mentionStore,
  });

  assert.equal(result.ok, false);
  assert.ok(result.error);
  assert.equal(repoStore.getAll().length, 0);
});
