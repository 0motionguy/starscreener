// Reactions storage layer tests. The toggle invariant is the load-bearing
// piece: a user must never be able to register the same (object, type)
// twice under any sequence of concurrent requests, because counts are
// derived by aggregating rows.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, rmSync } from "node:fs";
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
  toggleReaction,
  userReactionsFor,
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
