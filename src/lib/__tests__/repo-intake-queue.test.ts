// DORP (Drop a Repo) — integration tests for the Redis-backed submission
// store + intake queue + stats trio.
//
// Surface area under test:
//   - src/lib/repo-submissions-store.ts (readAll/append/update/getById +
//     _replaceAllForTests cap-at-1000 semantics)
//   - src/lib/repo-intake-queue.ts (enqueueDrop / peekQueueDepth / peekQueue
//     LPUSH/LLEN/LRANGE producer side)
//   - src/lib/repo-submissions.ts (submitRepoToQueue created/duplicate/
//     already_tracked + computeSubmissionStats hero counters)
//
// Wiring approach:
//   We can't pass a fake data-store directly to these modules — they call
//   `getDataStore()` (the lazy module singleton) at call time. So we:
//     1. Stub `@upstash/redis` via require.cache so the singleton's lazy
//        `require("@upstash/redis")` lands on our FakeRedis instead of the
//        real client.
//     2. Stub `@/lib/derived-repos` via require.cache so submitRepoToQueue's
//        already-tracked branch is deterministic instead of depending on the
//        bundled JSON snapshot.
//     3. Set UPSTASH_REDIS_REST_URL/TOKEN env vars so createDataStore picks
//        the Redis tier (otherwise the singleton degrades to file+memory and
//        skips the lpush path we want to exercise in F/G).
//     4. Point STARSCREENER_DATA_DIR at a tmp dir so drop-events.jsonl writes
//        don't touch the real .data/ tree.
//   _resetDataStoreForTests() runs in beforeEach so each test sees a fresh
//   singleton wired to a fresh fake.
//
// Run with:
//   npm test -- src/lib/__tests__/repo-intake-queue.test.ts

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import Module from "node:module";

// ---------------------------------------------------------------------------
// FakeRedis — implements every RedisClientLike method exercised by the
// modules under test (get/set/del + lpush/llen/lrange). The data-store
// reads/writes JSON-encoded payloads; the queue lpushes JSON-encoded
// strings and llen/lranges them back.
// ---------------------------------------------------------------------------

class FakeRedis {
  public store = new Map<string, string>();
  public lists = new Map<string, string[]>();
  public failNextLpushWith: Error | null = null;

  // Hand-rolled because the data-store uses `set(key, value, { ex?, nx? })`
  // while we don't exercise TTL or NX in any DORP path — a no-op accept is
  // fine for both.
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<string> {
    this.store.set(key, value);
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) {
      if (this.store.delete(k)) n += 1;
      if (this.lists.delete(k)) n += 1;
    }
    return n;
  }

  // Newest at LEFT (LPUSH), matches both ioredis and Upstash REST semantics.
  async lpush(key: string, ...values: string[]): Promise<number> {
    if (this.failNextLpushWith) {
      const err = this.failNextLpushWith;
      this.failNextLpushWith = null;
      throw err;
    }
    const list = this.lists.get(key) ?? [];
    // Real Redis lpushes args left-to-right, each new value going to head.
    for (const v of values) list.unshift(v);
    this.lists.set(key, list);
    return list.length;
  }

  async rpop(key: string): Promise<string | null> {
    const list = this.lists.get(key);
    if (!list || list.length === 0) return null;
    return list.pop() ?? null;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key) ?? [];
    // Redis LRANGE: inclusive on both ends; negative stop = from end.
    const len = list.length;
    const lo = start < 0 ? Math.max(0, len + start) : Math.min(start, len);
    const hi =
      stop < 0 ? Math.max(-1, len + stop) : Math.min(stop, len - 1);
    if (hi < lo) return [];
    return list.slice(lo, hi + 1);
  }

  async llen(key: string): Promise<number> {
    return this.lists.get(key)?.length ?? 0;
  }
}

// FakeRedis-without-list-primitives — exercises the Redis-disabled branch in
// enqueueDrop/peekQueue (the singleton has a redisClient, but lpush is
// undefined, simulating a backend that doesn't ship list ops).
class FakeRedisNoLists {
  public store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<string> {
    this.store.set(key, value);
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) {
      if (this.store.delete(k)) n += 1;
    }
    return n;
  }
  // Intentional: no lpush / llen / lrange — these are optional on
  // RedisClientLike, and the queue module must degrade gracefully when
  // they're absent.
}

// ---------------------------------------------------------------------------
// Module stubbing — has to run BEFORE the modules under test are imported.
// We replace `@upstash/redis` with a factory that returns whatever the
// active test has set in `activeRedis`. That lets each test swap the fake
// in/out without re-stubbing.
// ---------------------------------------------------------------------------

let activeRedis: unknown = null;

(function stubUpstash() {
  const upstashPath = require.resolve("@upstash/redis");
  // The Module type is stricter than the runtime shape — we only need
  // `exports` to satisfy require()'s lookup. Cast through `unknown` to
  // bypass the structural mismatch.
  require.cache[upstashPath] = {
    id: upstashPath,
    filename: upstashPath,
    loaded: true,
    exports: {
      // The data-store calls `new mod.Redis({ url, token })`. We return the
      // currently-active fake so a single test fixture can choose between
      // FakeRedis and FakeRedisNoLists per case.
      Redis: function StubbedRedisCtor(this: unknown) {
        return activeRedis as object;
      } as unknown as new (config: { url: string; token: string }) => unknown,
    },
    children: [],
    paths: (Module as unknown as { _nodeModulePaths: (p: string) => string[] })._nodeModulePaths(upstashPath),
  } as unknown as NodeJS.Module;
})();

// Stub derived-repos so the "already_tracked" branch of submitRepoToQueue
// is deterministic. We expose a single mutator `setTrackedRepo` that the
// test cases call when they want the next `getDerivedRepoByFullName(name)`
// call to return a fake Repo (instead of null).
const trackedRepos = new Map<string, unknown>();
function setTrackedRepo(fullName: string, repo: unknown): void {
  trackedRepos.set(fullName.toLowerCase(), repo);
}
function clearTrackedRepos(): void {
  trackedRepos.clear();
}

(function stubDerivedRepos() {
  const derivedPath = require.resolve("../derived-repos");
  require.cache[derivedPath] = {
    id: derivedPath,
    filename: derivedPath,
    loaded: true,
    exports: {
      getDerivedRepoByFullName: (fullName: string) =>
        trackedRepos.get(fullName.toLowerCase()) ?? null,
      // The real module also exports these; submitRepoToQueue only needs
      // getDerivedRepoByFullName, but stubbing the whole module surface
      // keeps any future transitive import from blowing up.
      getDerivedRepos: () => [],
      getDerivedRepoById: () => null,
      getDerivedRepoCount: () => 0,
      __resetDerivedReposCache: () => {},
    },
    children: [],
    paths: (Module as unknown as { _nodeModulePaths: (p: string) => string[] })._nodeModulePaths(derivedPath),
  } as unknown as NodeJS.Module;
})();

// ---------------------------------------------------------------------------
// Now safe to import the modules under test. They'll pick up our stubs on
// their first require.
// ---------------------------------------------------------------------------

import {
  _resetDataStoreForTests,
  closeDataStore,
} from "../data-store";
import {
  _replaceAllForTests,
  appendSubmission,
  getSubmissionById,
  readAllSubmissions,
  updateSubmissionById,
} from "../repo-submissions-store";
import type { RepoSubmissionRecord } from "../repo-submissions-types";
import {
  enqueueDrop,
  peekQueue,
  peekQueueDepth,
} from "../repo-intake-queue";
import {
  computeSubmissionStats,
  submitRepoToQueue,
} from "../repo-submissions";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

let tmpDir: string;
let fake: FakeRedis;
let savedEnv: Record<string, string | undefined>;
let savedCwd: string;

function snapshotEnv(): Record<string, string | undefined> {
  return {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    REDIS_URL: process.env.REDIS_URL,
    STARSCREENER_DATA_DIR: process.env.STARSCREENER_DATA_DIR,
    NODE_ENV: process.env.NODE_ENV,
  };
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(async () => {
  savedEnv = snapshotEnv();
  savedCwd = process.cwd();
  tmpDir = mkdtempSync(join(tmpdir(), "ss-dorp-test-"));
  fake = new FakeRedis();
  activeRedis = fake;

  // Hard-clear REDIS_URL so createDataStore takes the Upstash branch (which
  // is the only one our stub intercepts). Then point both Upstash vars at
  // bogus values so the env-missing fallback is bypassed.
  delete process.env.REDIS_URL;
  process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";
  process.env.STARSCREENER_DATA_DIR = tmpDir;

  // The data-store singleton computes its file-tier dataDir from
  // `<process.cwd()>/data`. We chdir into the tmp dir so the file tier
  // looks at <tmpDir>/data/repo-submissions.json (which doesn't exist) and
  // falls through to our fake Redis — instead of accidentally reading the
  // real repo's data/repo-submissions.json mirror, which is shared across
  // test invocations and would leak state.
  process.chdir(tmpDir);

  clearTrackedRepos();
  _resetDataStoreForTests();
});

afterEach(async () => {
  await closeDataStore();
  activeRedis = null;
  // Restore cwd BEFORE rming tmp dir, otherwise Windows refuses to delete
  // the dir we're currently inside.
  process.chdir(savedCwd);
  rmSync(tmpDir, { recursive: true, force: true });
  restoreEnv(savedEnv);
});

// Small helper — builds a minimal RepoSubmissionRecord with sensible defaults.
function makeRecord(
  overrides: Partial<RepoSubmissionRecord> & Pick<RepoSubmissionRecord, "id" | "fullName" | "submittedAt">,
): RepoSubmissionRecord {
  return {
    normalizedFullName: overrides.fullName.toLowerCase(),
    repoUrl: `https://github.com/${overrides.fullName}`,
    whyNow: null,
    contact: null,
    shareUrl: null,
    boostedByShare: false,
    source: "web" as const,
    status: "queued" as const,
    intakeTriggeredAt: null,
    lastScanAt: null,
    lastScanError: null,
    matchesFound: 0,
    repoPath: null,
    category: null,
    tags: null,
    releaseUrl: null,
    demoUrl: null,
    scanChannels: [],
    ...overrides,
  };
}

// ===========================================================================
// A. Storage round-trip
// ===========================================================================

test("A1 append + read returns the same record", async () => {
  const record = makeRecord({
    id: "id-1",
    fullName: "acme/widgets",
    submittedAt: "2026-05-20T10:00:00.000Z",
  });
  await appendSubmission(record);
  const all = await readAllSubmissions();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, "id-1");
  assert.equal(all[0].fullName, "acme/widgets");
});

test("A2 two appends come back sorted newest-first", async () => {
  await appendSubmission(
    makeRecord({
      id: "older",
      fullName: "acme/older",
      submittedAt: "2026-05-19T10:00:00.000Z",
    }),
  );
  await appendSubmission(
    makeRecord({
      id: "newer",
      fullName: "acme/newer",
      submittedAt: "2026-05-20T10:00:00.000Z",
    }),
  );
  const all = await readAllSubmissions();
  assert.equal(all.length, 2);
  assert.equal(all[0].id, "newer", "newest-first");
  assert.equal(all[1].id, "older");
});

test("A3 cap at 1000 — oldest falls off when 1001th record is appended", async () => {
  // Pre-load 1000 records with explicit, monotonically-decreasing timestamps
  // (so they're already in newest-first order). _replaceAllForTests is the
  // intended back-door for this.
  const base = Date.parse("2026-05-20T00:00:00.000Z");
  const seed: RepoSubmissionRecord[] = Array.from({ length: 1000 }, (_, i) =>
    makeRecord({
      id: `seed-${i}`,
      fullName: `acme/seed-${i}`,
      // Newer index = newer timestamp; so seed-0 is the OLDEST.
      submittedAt: new Date(base + i * 60_000).toISOString(),
    }),
  );
  await _replaceAllForTests(seed);
  const initial = await readAllSubmissions();
  assert.equal(initial.length, 1000);

  // Append a new record with a timestamp newer than anything else.
  const champion = makeRecord({
    id: "champion",
    fullName: "acme/champion",
    submittedAt: new Date(base + 9_999_999_999).toISOString(),
  });
  await appendSubmission(champion);

  const after = await readAllSubmissions();
  assert.equal(after.length, 1000, "cap holds at 1000");
  assert.equal(after[0].id, "champion", "newest is at the head");
  // The oldest (seed-0) must have fallen off the tail.
  assert.ok(
    !after.some((r) => r.id === "seed-0"),
    "oldest seed-0 should be evicted",
  );
});

// ===========================================================================
// B. getSubmissionById
// ===========================================================================

test("B1 unknown id returns null", async () => {
  const found = await getSubmissionById("nonexistent");
  assert.equal(found, null);
});

test("B2 known id returns the right record", async () => {
  await appendSubmission(
    makeRecord({
      id: "abc",
      fullName: "acme/findme",
      submittedAt: "2026-05-20T10:00:00.000Z",
    }),
  );
  const found = await getSubmissionById("abc");
  assert.ok(found, "expected to find the record");
  assert.equal(found?.fullName, "acme/findme");
});

test("B3 two records with the same fullName but different ids are both retrievable", async () => {
  await appendSubmission(
    makeRecord({
      id: "first",
      fullName: "acme/duplicate",
      submittedAt: "2026-05-20T10:00:00.000Z",
    }),
  );
  await appendSubmission(
    makeRecord({
      id: "second",
      fullName: "acme/duplicate",
      submittedAt: "2026-05-20T11:00:00.000Z",
    }),
  );
  const a = await getSubmissionById("first");
  const b = await getSubmissionById("second");
  assert.ok(a && b);
  assert.equal(a?.id, "first");
  assert.equal(b?.id, "second");
  assert.equal(a?.fullName, b?.fullName);
});

// ===========================================================================
// C. updateSubmissionById
// ===========================================================================

test("C1 patch sets status + lastScanAt; read returns new values", async () => {
  await appendSubmission(
    makeRecord({
      id: "scan-me",
      fullName: "acme/scan",
      submittedAt: "2026-05-20T10:00:00.000Z",
      status: "queued",
    }),
  );
  const updated = await updateSubmissionById("scan-me", {
    status: "listed",
    lastScanAt: "2026-05-20T12:00:00.000Z",
  });
  assert.ok(updated, "patch should return the updated record");
  assert.equal(updated?.status, "listed");
  assert.equal(updated?.lastScanAt, "2026-05-20T12:00:00.000Z");

  // Round-trip through the store.
  const reread = await getSubmissionById("scan-me");
  assert.equal(reread?.status, "listed");
  assert.equal(reread?.lastScanAt, "2026-05-20T12:00:00.000Z");
});

test("C2 patching a non-existent id returns null (not throw)", async () => {
  await appendSubmission(
    makeRecord({
      id: "real",
      fullName: "acme/real",
      submittedAt: "2026-05-20T10:00:00.000Z",
    }),
  );
  const result = await updateSubmissionById("does-not-exist", {
    status: "listed",
  });
  assert.equal(result, null);
});

// ===========================================================================
// D. submitRepoToQueue
// ===========================================================================

test("D1 created path stores a record with status=queued", async () => {
  const result = await submitRepoToQueue({
    repo: "vercel/next.js",
  });
  assert.equal(result.kind, "created");
  if (result.kind !== "created") return; // type-narrow
  assert.equal(result.submission.fullName, "vercel/next.js");
  assert.equal(result.submission.status, "queued");

  // Persisted in the store under the same id.
  const all = await readAllSubmissions();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, result.submission.id);
  assert.equal(all[0].status, "queued");
});

test("D2 duplicate path returns the existing submission, no new row", async () => {
  const first = await submitRepoToQueue({ repo: "acme/dup" });
  assert.equal(first.kind, "created");

  const second = await submitRepoToQueue({ repo: "Acme/Dup" }); // case-insensitive
  assert.equal(second.kind, "duplicate");
  if (second.kind !== "duplicate") return; // type-narrow
  if (first.kind !== "created") return; // already asserted; narrow

  assert.equal(second.submission.id, first.submission.id);

  // Only one row total — duplicate must not append.
  const all = await readAllSubmissions();
  assert.equal(all.length, 1);
});

test("D3 already_tracked path: pre-seed via getDerivedRepoByFullName, no new record stored", async () => {
  // Inject a fake Repo for "openai/openai-agents-python" so the
  // submitRepoToQueue branch sees a tracked match.
  setTrackedRepo("openai/openai-agents-python", {
    owner: "openai",
    name: "openai-agents-python",
    fullName: "openai/openai-agents-python",
  });

  const result = await submitRepoToQueue({
    repo: "openai/openai-agents-python",
  });
  assert.equal(result.kind, "already_tracked");
  if (result.kind !== "already_tracked") return; // type-narrow
  assert.equal(result.repo.fullName, "openai/openai-agents-python");
  assert.equal(
    result.repo.repoPath,
    "/repo/openai/openai-agents-python",
  );

  // Crucially: no submission row is written for already_tracked.
  const all = await readAllSubmissions();
  assert.equal(all.length, 0);
});

// ===========================================================================
// E. computeSubmissionStats
// ===========================================================================

test("E1 empty store: 0 / 0% / null", async () => {
  const stats = await computeSubmissionStats();
  assert.equal(stats.droppedThisWeek, 0);
  assert.equal(stats.percentListedUnder24h, 0);
  assert.equal(stats.medianTtlHours, null);
});

test("E2 mixed fixtures: 3 within 7 days, 5 older → droppedThisWeek=3", async () => {
  const now = Date.now();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  // 3 within the last 7 days (use 1, 3, 5 days ago)
  const withinWeek = [1, 3, 5].map((days, i) =>
    makeRecord({
      id: `wk-${i}`,
      fullName: `acme/wk-${i}`,
      submittedAt: new Date(now - days * MS_PER_DAY).toISOString(),
    }),
  );
  // 5 from prior weeks (10, 14, 20, 28, 60 days ago)
  const olderWeeks = [10, 14, 20, 28, 60].map((days, i) =>
    makeRecord({
      id: `old-${i}`,
      fullName: `acme/old-${i}`,
      submittedAt: new Date(now - days * MS_PER_DAY).toISOString(),
    }),
  );
  await _replaceAllForTests([...withinWeek, ...olderWeeks]);

  const stats = await computeSubmissionStats();
  assert.equal(stats.droppedThisWeek, 3);
});

test("E3 percentListedUnder24h reflects only the under-24h ones", async () => {
  const MS_PER_HOUR = 60 * 60 * 1000;
  const now = Date.now();
  // The "eligible" set is records submitted MORE than 24h ago. We seed three
  // with TTLs of 2h, 10h, and 30h. The 30h-TTL one is NOT under 24h —
  // expected: 2 of 3 listed under 24h → 67%.
  const submittedAt2h = new Date(now - 2 * 24 * MS_PER_HOUR).toISOString();
  const submittedAt10h = new Date(now - 3 * 24 * MS_PER_HOUR).toISOString();
  const submittedAt30h = new Date(now - 4 * 24 * MS_PER_HOUR).toISOString();
  const fixtures: RepoSubmissionRecord[] = [
    makeRecord({
      id: "ttl-2h",
      fullName: "acme/two",
      submittedAt: submittedAt2h,
      status: "listed",
      lastScanAt: new Date(
        Date.parse(submittedAt2h) + 2 * MS_PER_HOUR,
      ).toISOString(),
    }),
    makeRecord({
      id: "ttl-10h",
      fullName: "acme/ten",
      submittedAt: submittedAt10h,
      status: "listed",
      lastScanAt: new Date(
        Date.parse(submittedAt10h) + 10 * MS_PER_HOUR,
      ).toISOString(),
    }),
    makeRecord({
      id: "ttl-30h",
      fullName: "acme/thirty",
      submittedAt: submittedAt30h,
      status: "listed",
      lastScanAt: new Date(
        Date.parse(submittedAt30h) + 30 * MS_PER_HOUR,
      ).toISOString(),
    }),
  ];
  await _replaceAllForTests(fixtures);

  const stats = await computeSubmissionStats();
  // 2 of 3 listed within 24h → round(66.66...) = 67
  assert.equal(stats.percentListedUnder24h, 67);
});

test("E4 median TTL across [2h, 10h, 30h] = 10h", async () => {
  const MS_PER_HOUR = 60 * 60 * 1000;
  // Median TTL is computed off records submitted within the last 30 days
  // that reached status=listed. Use submittedAt 7 days ago (well within
  // the 30-day window) for all three so the day-window doesn't filter.
  const now = Date.now();
  const submittedAt = new Date(now - 7 * 24 * MS_PER_HOUR).toISOString();
  const submittedMs = Date.parse(submittedAt);

  const fixtures: RepoSubmissionRecord[] = [
    makeRecord({
      id: "m-2h",
      fullName: "acme/m2",
      submittedAt,
      status: "listed",
      lastScanAt: new Date(submittedMs + 2 * MS_PER_HOUR).toISOString(),
    }),
    makeRecord({
      id: "m-10h",
      fullName: "acme/m10",
      submittedAt,
      status: "listed",
      lastScanAt: new Date(submittedMs + 10 * MS_PER_HOUR).toISOString(),
    }),
    makeRecord({
      id: "m-30h",
      fullName: "acme/m30",
      submittedAt,
      status: "listed",
      lastScanAt: new Date(submittedMs + 30 * MS_PER_HOUR).toISOString(),
    }),
  ];
  await _replaceAllForTests(fixtures);

  const stats = await computeSubmissionStats();
  assert.equal(stats.medianTtlHours, 10);
});

// ===========================================================================
// F. enqueueDrop
// ===========================================================================

test("F1 successful lpush returns { ok: true, queueDepth: N }", async () => {
  const result = await enqueueDrop({
    submissionId: "sub-1",
    fullName: "acme/queued",
    enqueuedAt: new Date().toISOString(),
    source: "web:repo-submissions",
  });
  assert.equal(result.ok, true);
  assert.equal(result.queueDepth, 1);

  // Second push bumps the depth.
  const second = await enqueueDrop({
    submissionId: "sub-2",
    fullName: "acme/queued2",
    enqueuedAt: new Date().toISOString(),
    source: "web:repo-submissions",
  });
  assert.equal(second.ok, true);
  assert.equal(second.queueDepth, 2);
});

test("F2 Redis disabled (no lpush impl) → { ok: false, queueDepth: null }, no throw", async () => {
  // Swap the active redis for one without list methods. _resetDataStoreForTests
  // forces the singleton to rebuild on next access.
  activeRedis = new FakeRedisNoLists();
  _resetDataStoreForTests();

  const result = await enqueueDrop({
    submissionId: "sub-x",
    fullName: "acme/cant-queue",
    enqueuedAt: new Date().toISOString(),
    source: "web:repo-submissions",
  });
  assert.equal(result.ok, false);
  assert.equal(result.queueDepth, null);
});

test("F3 lpush throws → { ok: false, queueDepth: null }, error logged", async () => {
  // Capture console.error so we can assert the error is logged loudly
  // (per the jsdoc on enqueueDrop — the worker won't pick up the drop, so
  // an operator needs to see it in logs).
  const originalError = console.error;
  const calls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };

  try {
    fake.failNextLpushWith = new Error("simulated redis crash");
    const result = await enqueueDrop({
      submissionId: "sub-y",
      fullName: "acme/will-throw",
      enqueuedAt: new Date().toISOString(),
      source: "web:repo-submissions",
    });
    assert.equal(result.ok, false);
    assert.equal(result.queueDepth, null);
    assert.ok(
      calls.some(
        (c) =>
          typeof c[0] === "string" &&
          c[0].includes("[repo-intake-queue] lpush failed"),
      ),
      "expected an lpush-failed error log",
    );
  } finally {
    console.error = originalError;
  }
});

// ===========================================================================
// G. peekQueue
// ===========================================================================

test("G1 returns parsed payloads from the lrange result", async () => {
  await enqueueDrop({
    submissionId: "p1",
    fullName: "acme/peek1",
    enqueuedAt: "2026-05-20T10:00:00.000Z",
    source: "web:repo-submissions",
  });
  await enqueueDrop({
    submissionId: "p2",
    fullName: "acme/peek2",
    enqueuedAt: "2026-05-20T11:00:00.000Z",
    source: "web:repo-submissions",
  });

  const peeked = await peekQueue();
  assert.equal(peeked.length, 2);
  // Newest at head (LPUSH puts newest at left, LRANGE 0..N-1 reads left-to-right).
  assert.equal(peeked[0].submissionId, "p2");
  assert.equal(peeked[1].submissionId, "p1");

  const depth = await peekQueueDepth();
  assert.equal(depth, 2);
});

test("G2 malformed entries are skipped, not thrown", async () => {
  // Hand-craft a list with one valid payload, one garbage string, and one
  // valid-JSON-but-wrong-shape entry. peekQueue must filter to the valid one
  // without ever throwing.
  const valid = JSON.stringify({
    submissionId: "good",
    fullName: "acme/good",
    enqueuedAt: "2026-05-20T10:00:00.000Z",
    source: "web:repo-submissions",
  });
  const wrongShape = JSON.stringify({ unrelated: "object" });
  const garbage = "this-is-not-json";
  // Pre-seed the underlying list directly — peekQueue should observe all three.
  fake.lists.set("queue:drop-a-repo", [valid, wrongShape, garbage]);

  const peeked = await peekQueue();
  assert.equal(peeked.length, 1, "only the well-shaped payload survives");
  assert.equal(peeked[0].submissionId, "good");
});
