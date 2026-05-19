// Tests for the idea-contributions module. Mirrors the shape of
// ideas.test.ts — isolated TMP_DIR set via STARSCREENER_DATA_DIR before
// the module is imported so each run gets a fresh data directory, and
// every test starts with an empty JSONL via writeJsonlFile([]).
//
// Coverage:
//   * listContributions returns [] when no rows exist
//   * appendContribution → listContributions roundtrip preserves the row
//   * Concurrent appends do not corrupt the JSONL (5 parallel → 5 rows)

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_DIR = mkdtempSync(join(tmpdir(), "starscreener-contrib-test-"));
process.env.TRENDINGREPO_DATA_DIR = TMP_DIR;

import {
  IDEA_CONTRIBUTIONS_FILE,
  appendContribution,
  listContributions,
} from "../idea-contributions";
import { writeJsonlFile } from "../pipeline/storage/file-persistence";

process.on("exit", () => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

beforeEach(async () => {
  await writeJsonlFile(IDEA_CONTRIBUTIONS_FILE, []);
});

// ---------------------------------------------------------------------------
// Empty store
// ---------------------------------------------------------------------------

test("listContributions returns empty array when no contributions exist", async () => {
  const rows = await listContributions("idea-1");
  assert.deepEqual(rows, []);
});

test("listContributions returns empty array when other ideas have rows", async () => {
  await appendContribution({
    ideaId: "idea-other",
    userId: "u1",
    type: "comment",
    body: "Comment on a different idea entirely.",
  });
  const rows = await listContributions("idea-target");
  assert.deepEqual(rows, []);
});

// ---------------------------------------------------------------------------
// Append → list roundtrip
// ---------------------------------------------------------------------------

test("appendContribution writes a row that listContributions returns", async () => {
  const written = await appendContribution({
    ideaId: "idea-1",
    userId: "u1",
    type: "comment",
    body: "First contribution on this idea — nothing fancy.",
    mentionsRepos: ["vercel/next.js"],
    mentionsSkills: ["typescript"],
  });

  const rows = await listContributions("idea-1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, written.id);
  assert.equal(rows[0].ideaId, "idea-1");
  assert.equal(rows[0].userId, "u1");
  assert.equal(rows[0].type, "comment");
  assert.equal(rows[0].body, "First contribution on this idea — nothing fancy.");
  assert.deepEqual(rows[0].mentionsRepos, ["vercel/next.js"]);
  assert.deepEqual(rows[0].mentionsSkills, ["typescript"]);
  assert.ok(rows[0].createdAt, "createdAt should be set");
});

test("listContributions filters by ideaId and ignores rows for other ideas", async () => {
  await appendContribution({
    ideaId: "idea-a",
    userId: "u1",
    type: "comment",
    body: "Belongs to idea-a; should appear in the idea-a list.",
  });
  await appendContribution({
    ideaId: "idea-b",
    userId: "u1",
    type: "comment",
    body: "Belongs to idea-b; should not appear in the idea-a list.",
  });

  const aRows = await listContributions("idea-a");
  const bRows = await listContributions("idea-b");
  assert.equal(aRows.length, 1);
  assert.equal(bRows.length, 1);
  assert.equal(aRows[0].ideaId, "idea-a");
  assert.equal(bRows[0].ideaId, "idea-b");
});

// ---------------------------------------------------------------------------
// Concurrency — five parallel appends must net to five distinct rows.
// ---------------------------------------------------------------------------
//
// appendContribution uses appendJsonlFile which goes through fs.appendFile.
// Node's fs.appendFile is implemented as a single open(O_APPEND) + write +
// close per call; the kernel guarantees the write is atomic at the
// open-with-O_APPEND boundary for sizes below PIPE_BUF. Each contribution
// row serialises to well under 4 KB, so concurrent appends should each
// land as a complete line without interleaving.

test("concurrent appendContribution calls produce N distinct rows", async () => {
  const ideaId = "idea-concurrent";
  const writes = Array.from({ length: 5 }, (_, i) =>
    appendContribution({
      ideaId,
      userId: `u${i}`,
      type: "comment",
      body: `Parallel contribution number ${i} on this idea.`,
    }),
  );
  const written = await Promise.all(writes);

  const rows = await listContributions(ideaId);
  assert.equal(rows.length, 5, "expected exactly 5 rows after 5 parallel appends");

  // Every written id should be present in the listed rows — no row was
  // dropped, no row was duplicated.
  const writtenIds = new Set(written.map((r) => r.id));
  const listedIds = new Set(rows.map((r) => r.id));
  assert.equal(listedIds.size, 5, "rows should have 5 distinct ids");
  for (const id of writtenIds) {
    assert.ok(listedIds.has(id), `written id ${id} missing from listed rows`);
  }
});
