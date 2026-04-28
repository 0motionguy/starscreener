// StarScreener Pipeline — full hydration round-trip + debounce tests.
//
// These tests exercise the storage layer end-to-end:
//   1. Write data to fresh store instances, persist to disk, hydrate a second
//      set of fresh instances, and verify every field round-trips.
//   2. Verify `SNAPSHOT_HISTORY_CAP` clips the oldest entries on append.
//   3. Verify `schedulePersist()` + the mutation hook coalesce a burst of
//      mutations into a single on-disk flush.
//
// We deliberately avoid the singleton module here — its DATA_DIR is captured
// at module-load and shared across all tests in the process. Working with
// bare `new InMemoryXStore()` instances means we can point each test at its
// own temp dir via `STARSCREENER_DATA_DIR` before the file-persistence
// helpers read that env var for each I/O call.
//
// For the debounce test we DO exercise the singleton, but only via an
// isolated re-import of every storage module so the DATA_DIR env var is
// picked up fresh.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { Repo } from "../../types";
import type {
  AlertEvent,
  AlertRule,
  RepoCategory,
  RepoMention,
  RepoReason,
  RepoScore,
  RepoSnapshot,
  SocialAggregate,
} from "../types";

// ---------------------------------------------------------------------------
// Per-test harness — fresh temp dir + fresh modules so DATA_DIR re-reads env.
// ---------------------------------------------------------------------------

interface Harness {
  dir: string;
  // Fresh module instances — used for isolated tests.
  memoryStores: typeof import("../storage/memory-stores");
  filePersistence: typeof import("../storage/file-persistence");
}

async function setupHarness(): Promise<Harness> {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "starscreener-hydrate-"),
  );
  process.env.STARSCREENER_DATA_DIR = dir;
  delete process.env.STARSCREENER_PERSIST; // force enabled

  // LIB-15: ESM module-cache busting via query string. randomUUID() is
  // deterministic enough for parallel tests (the prior `${Date.now()}-
  // ${Math.random()}` collided when two tests fired in the same ms with
  // the same RNG seed on Windows under tsx). The query-string trick
  // remains the lightest-touch isolation; a true factory `dataDir` param
  // would be cleaner but requires reshaping file-persistence's module
  // surface, tracked as a follow-up.
  const bust = randomUUID();
  const filePersistenceUrl = new URL(
    `../storage/file-persistence.ts?t=${bust}`,
    import.meta.url,
  );
  const memoryStoresUrl = new URL(
    `../storage/memory-stores.ts?t=${bust}`,
    import.meta.url,
  );
  const filePersistence = (await import(
    filePersistenceUrl.href,
  )) as Harness["filePersistence"];
  const memoryStores = (await import(
    memoryStoresUrl.href,
  )) as Harness["memoryStores"];

  return { dir, memoryStores, filePersistence };
}

async function teardown(h: Harness): Promise<void> {
  await fs.rm(h.dir, { recursive: true, force: true });
  delete process.env.STARSCREENER_DATA_DIR;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mockRepo(id = "acme--rocket"): Repo {
  return {
    id,
    fullName: id.replace("--", "/"),
    name: id.split("--")[1],
    owner: id.split("--")[0],
    ownerAvatarUrl: "https://example.com/a.png",
    description: "desc",
    url: `https://github.com/${id.replace("--", "/")}`,
    language: "TypeScript",
    topics: ["web"],
    categoryId: "web-frameworks",
    stars: 1000,
    forks: 100,
    contributors: 50,
    openIssues: 10,
    lastCommitAt: "2026-04-10T00:00:00.000Z",
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "2023-01-01T00:00:00.000Z",
    starsDelta24h: 10,
    starsDelta7d: 50,
    starsDelta30d: 200,
    forksDelta7d: 5,
    contributorsDelta30d: 2,
    momentumScore: 42,
    movementStatus: "rising",
    rank: 5,
    categoryRank: 1,
    sparklineData: new Array(30).fill(10),
    socialBuzzScore: 30,
    mentionCount24h: 2,
  };
}

function mockSnapshot(repoId: string, capturedAt: string): RepoSnapshot {
  return {
    // Composite id: `${repoId}:${capturedAt}:${source}`. Legacy 2-part ids
    // are rewritten by hydrate() to this shape.
    id: `${repoId}:${capturedAt}:mock`,
    repoId,
    capturedAt,
    source: "mock",
    stars: 1000,
    forks: 100,
    openIssues: 10,
    watchers: 1000,
    contributors: 50,
    sizeKb: 0,
    lastCommitAt: capturedAt,
    lastReleaseAt: null,
    lastReleaseTag: null,
    mentionCount24h: 0,
    socialBuzzScore: 0,
  };
}

function mockScore(repoId: string): RepoScore {
  return {
    repoId,
    computedAt: "2026-04-17T00:00:00.000Z",
    overall: 75,
    components: {
      starVelocity24h: 50,
      starVelocity7d: 60,
      forkVelocity7d: 40,
      contributorGrowth30d: 30,
      commitFreshness: 80,
      releaseFreshness: 20,
      socialBuzz: 10,
      issueActivity: 50,
      communityHealth: 70,
      categoryMomentum: 55,
    },
    weights: {
      starVelocity24h: 0.1,
      starVelocity7d: 0.1,
      forkVelocity7d: 0.1,
      contributorGrowth30d: 0.1,
      commitFreshness: 0.1,
      releaseFreshness: 0.1,
      socialBuzz: 0.1,
      issueActivity: 0.1,
      communityHealth: 0.1,
      categoryMomentum: 0.1,
    },
    modifiers: {
      decayFactor: 1,
      antiSpamDampening: 1,
      breakoutMultiplier: 1,
      quietKillerBonus: 0,
    },
    isBreakout: false,
    isQuietKiller: false,
    movementStatus: "rising",
    explanation: "strong momentum",
  };
}

function mockCategory(repoId: string): RepoCategory {
  return {
    repoId,
    classifiedAt: "2026-04-17T00:00:00.000Z",
    primary: {
      categoryId: "web-frameworks",
      confidence: 0.9,
      matched: { topics: ["web"], keywords: [], ownerPrefix: null },
    },
    secondary: [],
  };
}

function mockReason(repoId: string): RepoReason {
  return {
    repoId,
    generatedAt: "2026-04-17T00:00:00.000Z",
    codes: ["star_velocity_up"],
    summary: "Stars are accelerating",
    details: [
      {
        code: "star_velocity_up",
        headline: "+10 stars in 24h",
        detail: "double the 7-day average",
        confidence: "high",
        timeframe: "24h",
        evidence: [{ label: "delta", value: 10 }],
      },
    ],
  };
}

function mockMention(repoId: string): RepoMention {
  return {
    id: `${repoId}:mention:1`,
    repoId,
    platform: "hackernews",
    author: "alice",
    authorFollowers: null,
    content: "cool repo",
    url: "https://news.ycombinator.com/item?id=1",
    sentiment: "positive",
    engagement: 100,
    reach: 1000,
    postedAt: "2026-04-17T00:00:00.000Z",
    discoveredAt: "2026-04-17T00:10:00.000Z",
    isInfluencer: false,
    // MentionStore.append() fills normalizedUrl on write (P1 dedup fix).
    // Include it in the fixture so deepEqual(restoredMention, mention)
    // reflects the post-append + post-hydrate canonical shape.
    normalizedUrl: "https://news.ycombinator.com/item?id=1",
  };
}

function mockAggregate(repoId: string): SocialAggregate {
  return {
    repoId,
    computedAt: "2026-04-17T00:00:00.000Z",
    mentionCount24h: 1,
    mentionCount7d: 1,
    platformBreakdown: { hackernews: 1 },
    sentimentScore: 0.8,
    influencerMentions: 0,
    totalReach: 1000,
    buzzScore: 25,
    buzzTrend: "rising",
  };
}

function mockAlertRule(): AlertRule {
  return {
    id: "rule_1",
    userId: "local",
    repoId: null,
    categoryId: null,
    trigger: "star_spike",
    threshold: 100,
    cooldownMinutes: 60,
    enabled: true,
    createdAt: "2026-04-17T00:00:00.000Z",
    lastFiredAt: null,
  };
}

function mockAlertEvent(): AlertEvent {
  return {
    id: "event_1",
    ruleId: "rule_1",
    repoId: "acme--rocket",
    userId: "local",
    trigger: "star_spike",
    title: "rocket spiked",
    body: "+120 stars in 24h",
    url: "https://github.com/acme/rocket",
    firedAt: "2026-04-17T01:00:00.000Z",
    readAt: null,
    conditionValue: 120,
    threshold: 100,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let harness: Harness;

beforeEach(async () => {
  harness = await setupHarness();
});

afterEach(async () => {
  await teardown(harness);
});

test("full round-trip: every store type hydrates back from disk", async () => {
  const { memoryStores } = harness;

  // Generation 1: seed fresh stores, persist, done.
  const g1 = {
    repo: new memoryStores.InMemoryRepoStore(),
    snap: new memoryStores.InMemorySnapshotStore(),
    score: new memoryStores.InMemoryScoreStore(),
    category: new memoryStores.InMemoryCategoryStore(),
    reason: new memoryStores.InMemoryReasonStore(),
    mention: new memoryStores.InMemoryMentionStore(),
    rule: new memoryStores.InMemoryAlertRuleStore(),
    event: new memoryStores.InMemoryAlertEventStore(),
  };

  const repo = mockRepo();
  const snap = mockSnapshot(repo.id, "2026-04-17T00:00:00.000Z");
  const score = mockScore(repo.id);
  const cat = mockCategory(repo.id);
  const reason = mockReason(repo.id);
  const mention = mockMention(repo.id);
  const aggregate = mockAggregate(repo.id);
  const rule = mockAlertRule();
  const event = mockAlertEvent();

  g1.repo.upsert(repo);
  g1.snap.append(snap);
  g1.score.save(score);
  g1.category.save(cat);
  g1.reason.save(reason);
  g1.mention.append(mention);
  g1.mention.saveAggregate(aggregate);
  g1.rule.save(rule);
  g1.event.append(event);

  await Promise.all([
    g1.repo.persist(),
    g1.snap.persist(),
    g1.score.persist(),
    g1.category.persist(),
    g1.reason.persist(),
    g1.mention.persist(),
    g1.rule.persist(),
    g1.event.persist(),
  ]);

  // Generation 2: brand-new stores pointing at the same on-disk files.
  const g2 = {
    repo: new memoryStores.InMemoryRepoStore(),
    snap: new memoryStores.InMemorySnapshotStore(),
    score: new memoryStores.InMemoryScoreStore(),
    category: new memoryStores.InMemoryCategoryStore(),
    reason: new memoryStores.InMemoryReasonStore(),
    mention: new memoryStores.InMemoryMentionStore(),
    rule: new memoryStores.InMemoryAlertRuleStore(),
    event: new memoryStores.InMemoryAlertEventStore(),
  };
  await Promise.all([
    g2.repo.hydrate(),
    g2.snap.hydrate(),
    g2.score.hydrate(),
    g2.category.hydrate(),
    g2.reason.hydrate(),
    g2.mention.hydrate(),
    g2.rule.hydrate(),
    g2.event.hydrate(),
  ]);

  assert.deepEqual(g2.repo.get(repo.id), repo);
  assert.equal(g2.repo.getAll().length, 1);
  assert.deepEqual(g2.repo.getByFullName(repo.fullName), repo);

  assert.deepEqual(g2.snap.getLatest(repo.id), snap);
  assert.equal(g2.snap.list(repo.id).length, 1);

  assert.deepEqual(g2.score.get(repo.id), score);
  assert.equal(g2.score.getAll().length, 1);

  assert.deepEqual(g2.category.get(repo.id), cat);
  assert.deepEqual(g2.reason.get(repo.id), reason);

  const [restoredMention] = g2.mention.listForRepo(repo.id);
  assert.deepEqual(restoredMention, mention);
  assert.deepEqual(g2.mention.aggregateForRepo(repo.id), aggregate);

  assert.deepEqual(g2.rule.listAll()[0], rule);
  assert.deepEqual(g2.event.listForUser(event.userId)[0], event);
});

test("multi-repo hydrate preserves every repo's data", async () => {
  const { memoryStores } = harness;
  const g1 = {
    repo: new memoryStores.InMemoryRepoStore(),
    snap: new memoryStores.InMemorySnapshotStore(),
  };

  const ids = ["alice--one", "bob--two", "carol--three"];
  for (const id of ids) {
    g1.repo.upsert(mockRepo(id));
    for (let i = 0; i < 3; i++) {
      const iso = `2026-04-1${i}T00:00:00.000Z`;
      g1.snap.append(mockSnapshot(id, iso));
    }
  }
  await g1.repo.persist();
  await g1.snap.persist();

  const g2 = {
    repo: new memoryStores.InMemoryRepoStore(),
    snap: new memoryStores.InMemorySnapshotStore(),
  };
  await g2.repo.hydrate();
  await g2.snap.hydrate();

  assert.equal(g2.repo.getAll().length, 3);
  for (const id of ids) {
    assert.ok(g2.repo.get(id), `repo ${id} should be present`);
    assert.equal(g2.snap.list(id).length, 3, `3 snapshots for ${id}`);
  }
});

test("alert hydrate replaces deleted rules and events instead of merging", async () => {
  const { memoryStores } = harness;

  const writer = {
    rule: new memoryStores.InMemoryAlertRuleStore(),
    event: new memoryStores.InMemoryAlertEventStore(),
  };
  const reader = {
    rule: new memoryStores.InMemoryAlertRuleStore(),
    event: new memoryStores.InMemoryAlertEventStore(),
  };

  const rule = mockAlertRule();
  const event = mockAlertEvent();

  writer.rule.save(rule);
  writer.event.append(event);
  await Promise.all([writer.rule.persist(), writer.event.persist()]);

  await Promise.all([reader.rule.hydrate(), reader.event.hydrate()]);
  assert.equal(reader.rule.listAll().length, 1);
  assert.equal(reader.event.listForUser(event.userId).length, 1);

  writer.rule.remove(rule.id);
  await writer.rule.persist();
  await writer.event.persist();

  await Promise.all([reader.rule.hydrate(), reader.event.hydrate()]);
  assert.equal(reader.rule.listAll().length, 0);
  assert.equal(reader.event.listForUser(event.userId).length, 1);
});

test("snapshot retention cap drops oldest entries beyond SNAPSHOT_HISTORY_CAP", () => {
  const { memoryStores } = harness;
  const store = new memoryStores.InMemorySnapshotStore();
  const cap = memoryStores.SNAPSHOT_HISTORY_CAP;
  assert.ok(cap > 0, "cap must be positive");

  // Append cap + 20 snapshots with strictly increasing timestamps.
  const total = cap + 20;
  const iso = (i: number): string => {
    const day = String(1 + Math.floor(i / 1440)).padStart(2, "0");
    const hour = String(Math.floor((i % 1440) / 60)).padStart(2, "0");
    const minute = String(i % 60).padStart(2, "0");
    return `2026-04-${day}T${hour}:${minute}:00.000Z`;
  };
  for (let i = 0; i < total; i++) {
    store.append(mockSnapshot("acme--rocket", iso(i)));
  }
  const list = store.list("acme--rocket");
  assert.equal(list.length, cap);
  // Newest-first: index 0 should be the most recently appended entry.
  assert.equal(list[0].capturedAt, iso(total - 1));
  // And the oldest retained entry should be entry `20` (we dropped 0..19).
  assert.equal(list[list.length - 1].capturedAt, iso(20));
});

test("mutation hook fires exactly once per mutator call", () => {
  const { memoryStores } = harness;
  let calls = 0;
  memoryStores.setStoreMutationHook(() => {
    calls += 1;
  });

  try {
    const repo = new memoryStores.InMemoryRepoStore();
    const snap = new memoryStores.InMemorySnapshotStore();
    const score = new memoryStores.InMemoryScoreStore();
    const category = new memoryStores.InMemoryCategoryStore();
    const reason = new memoryStores.InMemoryReasonStore();
    const mention = new memoryStores.InMemoryMentionStore();
    const rule = new memoryStores.InMemoryAlertRuleStore();
    const event = new memoryStores.InMemoryAlertEventStore();

    repo.upsert(mockRepo("a--b")); // 1
    snap.append(mockSnapshot("a--b", "2026-04-17T00:00:00.000Z")); // 2
    score.save(mockScore("a--b")); // 3
    category.save(mockCategory("a--b")); // 4
    reason.save(mockReason("a--b")); // 5
    mention.append(mockMention("a--b")); // 6
    mention.saveAggregate(mockAggregate("a--b")); // 7
    rule.save(mockAlertRule()); // 8
    event.append(mockAlertEvent()); // 9

    assert.equal(calls, 9, "every mutator should have fired the hook once");
  } finally {
    memoryStores.setStoreMutationHook(null);
  }
});

test("debounced persist coalesces a burst of mutations into one flush", async () => {
  // Simulate the singleton's debounce manually against bare stores so we
  // stay independent of the module-cache issues around singleton DATA_DIR
  // capture. The contract is: N mutations fired in a tight loop result in
  // at most one persist call.
  const { memoryStores, filePersistence } = harness;

  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let persistDone: Promise<void> | null = null;
  let persistsFired = 0;
  const store = new memoryStores.InMemoryRepoStore();

  const schedule = (delayMs: number) => {
    if (persistTimer !== null) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persistsFired += 1;
      // Use the fresh file-persistence module so DATA_DIR reads this
      // test's STARSCREENER_DATA_DIR.
      persistDone = store.persist();
    }, delayMs);
  };

  memoryStores.setStoreMutationHook(() => schedule(30));

  try {
    store.upsert(mockRepo("a--one"));
    store.upsert(mockRepo("b--two"));
    store.upsert(mockRepo("c--three"));

    // Wait enough for the debounce to fire at most once.
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(
      persistsFired,
      1,
      "three upserts should coalesce into one persist",
    );
    await persistDone;

    const filePath = path.join(harness.dir, filePersistence.FILES.repos);
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.trim().split("\n");
    assert.equal(lines.length, 3, "all three upserts should be on disk");
    const ids = new Set(lines.map((l) => (JSON.parse(l) as Repo).id));
    assert.ok(ids.has("a--one"));
    assert.ok(ids.has("b--two"));
    assert.ok(ids.has("c--three"));
  } finally {
    if (persistTimer !== null) clearTimeout(persistTimer);
    memoryStores.setStoreMutationHook(null);
  }
});

test("debounced persist does not fire before the timeout elapses", async () => {
  const { memoryStores, filePersistence } = harness;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  const store = new memoryStores.InMemoryRepoStore();

  memoryStores.setStoreMutationHook(() => {
    if (persistTimer !== null) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      void store.persist();
    }, 2000);
  });

  try {
    store.upsert(mockRepo("should--not-persist"));
    // Only 40ms elapsed — nowhere near the 2s debounce.
    await new Promise((resolve) => setTimeout(resolve, 40));

    if (persistTimer !== null) clearTimeout(persistTimer);

    const filePath = path.join(harness.dir, filePersistence.FILES.repos);
    await assert.rejects(
      () => fs.stat(filePath),
      (err: NodeJS.ErrnoException) => err.code === "ENOENT",
      "file should not exist because the timer was cancelled before firing",
    );
  } finally {
    if (persistTimer !== null) clearTimeout(persistTimer);
    memoryStores.setStoreMutationHook(null);
  }
});
