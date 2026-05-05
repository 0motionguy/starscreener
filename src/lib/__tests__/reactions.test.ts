// Reactions storage layer tests. The toggle invariant is the load-bearing
// piece: a user must never be able to register the same (object, type)
// twice under any sequence of concurrent requests, because counts are
// derived by aggregating rows.

import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, rmSync, promises as fsPromises } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_DIR = mkdtempSync(join(tmpdir(), "starscreener-reactions-test-"));
process.env.STARSCREENER_DATA_DIR = TMP_DIR;

import {
  REACTIONS_FILE,
  countReactions,
  emptyReactionCounts,
  HIGH_COMMITMENT_REACTIONS,
  isReactionType,
  listReactions,
  listReactionsForObject,
  listReactionsForObjects,
  toggleReaction,
  userReactionsFor,
  type ReactionRecord,
} from "../reactions";
import { writeJsonlFile } from "../pipeline/storage/file-persistence";

process.on("exit", () => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

beforeEach(async () => {
  await writeJsonlFile(REACTIONS_FILE, []);
});

test("emptyReactionCounts has all four types at zero", () => {
  const counts = emptyReactionCounts();
  assert.deepEqual(counts, { build: 0, use: 0, buy: 0, invest: 0 });
});

test("isReactionType narrows correctly", () => {
  assert.equal(isReactionType("build"), true);
  assert.equal(isReactionType("use"), true);
  assert.equal(isReactionType("buy"), true);
  assert.equal(isReactionType("invest"), true);
  assert.equal(isReactionType("share"), false);
  assert.equal(isReactionType(""), false);
  assert.equal(isReactionType(undefined), false);
});

test("buy and invest are flagged high-commitment; build and use are not", () => {
  assert.equal(HIGH_COMMITMENT_REACTIONS.has("buy"), true);
  assert.equal(HIGH_COMMITMENT_REACTIONS.has("invest"), true);
  assert.equal(HIGH_COMMITMENT_REACTIONS.has("build"), false);
  assert.equal(HIGH_COMMITMENT_REACTIONS.has("use"), false);
});

test("toggleReaction adds on first call and removes on second", async () => {
  const first = await toggleReaction({
    userId: "u1",
    objectType: "repo",
    objectId: "vercel/next.js",
    reactionType: "build",
  });
  assert.equal(first.kind, "added");

  const second = await toggleReaction({
    userId: "u1",
    objectType: "repo",
    objectId: "vercel/next.js",
    reactionType: "build",
  });
  assert.equal(second.kind, "removed");

  const all = await listReactions();
  assert.equal(all.length, 0, "second toggle should leave zero rows");
});

test("toggleReaction normalizes objectId to lowercase", async () => {
  await toggleReaction({
    userId: "u1",
    objectType: "repo",
    objectId: "Vercel/Next.js",
    reactionType: "build",
  });

  const lookup = await listReactionsForObject("repo", "vercel/next.js");
  assert.equal(lookup.length, 1);
  // And the second call with the original casing must hit the same row.
  const toggleAgain = await toggleReaction({
    userId: "u1",
    objectType: "repo",
    objectId: "vercel/next.js",
    reactionType: "build",
  });
  assert.equal(toggleAgain.kind, "removed");
});

test("different reaction types on the same target coexist", async () => {
  await toggleReaction({
    userId: "u1",
    objectType: "repo",
    objectId: "acme/widgets",
    reactionType: "build",
  });
  await toggleReaction({
    userId: "u1",
    objectType: "repo",
    objectId: "acme/widgets",
    reactionType: "buy",
  });
  const records = await listReactionsForObject("repo", "acme/widgets");
  assert.equal(records.length, 2);
  assert.deepEqual(countReactions(records), {
    build: 1,
    use: 0,
    buy: 1,
    invest: 0,
  });
});

test("userReactionsFor returns the per-type state for a given user", async () => {
  await toggleReaction({
    userId: "u1",
    objectType: "repo",
    objectId: "acme/widgets",
    reactionType: "build",
  });
  await toggleReaction({
    userId: "u2",
    objectType: "repo",
    objectId: "acme/widgets",
    reactionType: "invest",
  });
  const records = await listReactionsForObject("repo", "acme/widgets");
  assert.deepEqual(userReactionsFor("u1", records), {
    build: true,
    use: false,
    buy: false,
    invest: false,
  });
  assert.deepEqual(userReactionsFor("u2", records), {
    build: false,
    use: false,
    buy: false,
    invest: true,
  });
  assert.deepEqual(userReactionsFor("u3", records), {
    build: false,
    use: false,
    buy: false,
    invest: false,
  });
});

test("concurrent toggles on the same (user, target, type) net to one row", async () => {
  // Without the per-file mutex this would race: both reads see no row,
  // both inserts append, and the user ends up double-counted. With the
  // lock the second call sees the first's write and toggles it off, so
  // we land on zero rows (added then removed).
  await Promise.all(
    Array.from({ length: 4 }, () =>
      toggleReaction({
        userId: "u1",
        objectType: "repo",
        objectId: "race/repo",
        reactionType: "build",
      }),
    ),
  );
  const records = await listReactionsForObject("repo", "race/repo");
  // Even number of toggles → zero rows.
  assert.equal(records.length, 0);
});

test("concurrent toggles from different users each net to one row", async () => {
  await Promise.all([
    toggleReaction({
      userId: "u1",
      objectType: "repo",
      objectId: "shared/repo",
      reactionType: "use",
    }),
    toggleReaction({
      userId: "u2",
      objectType: "repo",
      objectId: "shared/repo",
      reactionType: "use",
    }),
    toggleReaction({
      userId: "u3",
      objectType: "repo",
      objectId: "shared/repo",
      reactionType: "use",
    }),
  ]);
  const records = await listReactionsForObject("repo", "shared/repo");
  assert.equal(records.length, 3);
  assert.equal(countReactions(records).use, 3);
});

// AGN-444: /ideas page used to do Promise.all(visible.map(listReactionsForObject))
// — one whole-file scan per visible idea (1+N). The fix is the batched
// listReactionsForObjects, which must produce a Map keyed on the *original*
// caller-supplied ids, materialise empty buckets for ids with zero reactions,
// and read the JSONL exactly once regardless of N.
test("listReactionsForObjects groups N ideas in a single file read (no 1+N fan-out)", async () => {
  // Seed a mixed reactions file: 2 ideas with reactions, plus an unrelated
  // repo row that must be filtered out by objectType.
  const seed: ReactionRecord[] = [
    {
      id: "r1",
      userId: "u1",
      objectType: "idea",
      objectId: "idea-a",
      reactionType: "build",
      createdAt: "2026-05-01T00:00:00.000Z",
    },
    {
      id: "r2",
      userId: "u2",
      objectType: "idea",
      objectId: "idea-a",
      reactionType: "use",
      createdAt: "2026-05-01T00:01:00.000Z",
    },
    {
      id: "r3",
      userId: "u1",
      objectType: "idea",
      objectId: "idea-b",
      reactionType: "invest",
      createdAt: "2026-05-01T00:02:00.000Z",
    },
    {
      id: "r4",
      userId: "u9",
      objectType: "repo",
      objectId: "idea-a", // same id, different type — must NOT bleed in
      reactionType: "buy",
      createdAt: "2026-05-01T00:03:00.000Z",
    },
  ];
  await writeJsonlFile(REACTIONS_FILE, seed);

  // Spy on the underlying readFile so we can assert exactly one read for the
  // reactions file across N callers.
  const readSpy = mock.method(fsPromises, "readFile");

  // 5 ideas, three of which have zero reactions. Mixed casing on the wire
  // to lock in the lowercase-normalisation contract.
  const ids = ["idea-a", "Idea-B", "idea-c", "idea-d", "idea-e"];
  const map = await listReactionsForObjects("idea", ids);

  // Count reads of the reactions JSONL specifically (other modules may read
  // unrelated files during module init).
  const reactionsReads = readSpy.mock.calls.filter((c) => {
    const arg = c.arguments[0];
    return typeof arg === "string" && arg.endsWith(REACTIONS_FILE);
  }).length;
  readSpy.mock.restore();

  assert.equal(
    reactionsReads,
    1,
    `expected exactly 1 read of ${REACTIONS_FILE} for ${ids.length} ideas, got ${reactionsReads}`,
  );

  // Map is keyed by the caller-supplied id (preserving original casing).
  for (const id of ids) {
    assert.ok(map.has(id), `expected map to have an entry for ${id}`);
  }

  // idea-a: two reactions (build, use). idea-b: one (invest, casing-insensitive).
  assert.equal(map.get("idea-a")!.length, 2);
  assert.deepEqual(countReactions(map.get("idea-a")!), {
    build: 1,
    use: 1,
    buy: 0,
    invest: 0,
  });
  assert.equal(map.get("Idea-B")!.length, 1);
  assert.deepEqual(countReactions(map.get("Idea-B")!), {
    build: 0,
    use: 0,
    buy: 0,
    invest: 1,
  });

  // Ideas with zero reactions get materialised empty buckets — counts must
  // collapse cleanly to all-zero (no NULL leaking into the page render).
  for (const id of ["idea-c", "idea-d", "idea-e"]) {
    const bucket = map.get(id);
    assert.deepEqual(bucket, [], `expected empty bucket for ${id}`);
    assert.deepEqual(countReactions(bucket!), emptyReactionCounts());
  }
});

test("listReactionsForObjects on empty input does zero file reads", async () => {
  const readSpy = mock.method(fsPromises, "readFile");
  const map = await listReactionsForObjects("idea", []);
  const reactionsReads = readSpy.mock.calls.filter((c) => {
    const arg = c.arguments[0];
    return typeof arg === "string" && arg.endsWith(REACTIONS_FILE);
  }).length;
  readSpy.mock.restore();

  assert.equal(map.size, 0);
  assert.equal(
    reactionsReads,
    0,
    "empty id list must short-circuit before touching the JSONL file",
  );
});
