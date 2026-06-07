import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_DIR = mkdtempSync(join(tmpdir(), "trendingrepo-comment-reactions-test-"));
process.env.TRENDINGREPO_DATA_DIR = TMP_DIR;

import {
  REPO_COMMENT_REACTIONS_FILE,
  getReactionsForComments,
} from "../repo-comment-reactions";
import { writeJsonlFile } from "../pipeline/storage/file-persistence";

process.on("exit", () => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

beforeEach(async () => {
  await writeJsonlFile(REPO_COMMENT_REACTIONS_FILE, []);
});

test("getReactionsForComments aggregates several comments from one replay", async () => {
  await writeJsonlFile(REPO_COMMENT_REACTIONS_FILE, [
    {
      commentId: "c1",
      clerkUserId: "u1",
      reaction: "heart",
      createdAt: "2026-06-01T00:00:00.000Z",
    },
    {
      commentId: "c1",
      clerkUserId: "u2",
      reaction: "bookmark",
      createdAt: "2026-06-01T00:01:00.000Z",
    },
    {
      commentId: "c2",
      clerkUserId: "u1",
      reaction: "unicorn",
      createdAt: "2026-06-01T00:02:00.000Z",
    },
    {
      commentId: "c2",
      clerkUserId: "u3",
      reaction: "heart",
      createdAt: "2026-06-01T00:03:00.000Z",
      removedAt: "2026-06-01T00:04:00.000Z",
    },
    {
      commentId: "ignored",
      clerkUserId: "u4",
      reaction: "heart",
      createdAt: "2026-06-01T00:05:00.000Z",
    },
  ]);

  const aggregates = await getReactionsForComments(["c1", "c2", "missing"], "u1");

  assert.deepEqual(aggregates.c1, {
    counts: { heart: 1, unicorn: 0, bookmark: 1 },
    userReaction: "heart",
  });
  assert.deepEqual(aggregates.c2, {
    counts: { heart: 0, unicorn: 1, bookmark: 0 },
    userReaction: "unicorn",
  });
  assert.deepEqual(aggregates.missing, {
    counts: { heart: 0, unicorn: 0, bookmark: 0 },
    userReaction: null,
  });
});
