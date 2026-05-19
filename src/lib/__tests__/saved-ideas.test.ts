// Tests for the saved-ideas module. Same isolation pattern as
// ideas.test.ts / idea-contributions.test.ts — each test starts with an
// empty JSONL store.
//
// Coverage:
//   * listSavedIdeas([]) when no saves
//   * saveIdea is idempotent — second call returns "already-saved"
//   * unsaveIdea removes the row; second call returns "not-found"
//   * User isolation — userA's saves don't appear in userB's list

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_DIR = mkdtempSync(join(tmpdir(), "starscreener-saved-test-"));
process.env.TRENDINGREPO_DATA_DIR = TMP_DIR;

import {
  SAVED_IDEAS_FILE,
  listSavedIdeas,
  saveIdea,
  unsaveIdea,
} from "../saved-ideas";
import { writeJsonlFile } from "../pipeline/storage/file-persistence";

process.on("exit", () => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

beforeEach(async () => {
  await writeJsonlFile(SAVED_IDEAS_FILE, []);
});

// ---------------------------------------------------------------------------
// Empty store
// ---------------------------------------------------------------------------

test("listSavedIdeas returns empty array when user has no saves", async () => {
  const rows = await listSavedIdeas("u1");
  assert.deepEqual(rows, []);
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test("saveIdea returns 'saved' on first call and 'already-saved' on retry", async () => {
  const first = await saveIdea("u1", "idea-1");
  assert.equal(first.kind, "saved");

  const second = await saveIdea("u1", "idea-1");
  assert.equal(second.kind, "already-saved");

  // Same record id both times — the retry must not mint a fresh row.
  if (first.kind === "saved" && second.kind === "already-saved") {
    assert.equal(
      first.record.id,
      second.record.id,
      "retry should reference the original row, not a new one",
    );
  }

  // Only one row exists in storage after the retry.
  const rows = await listSavedIdeas("u1");
  assert.equal(rows.length, 1);
});

test("saveIdea allows the same user to save multiple distinct ideas", async () => {
  const a = await saveIdea("u1", "idea-a");
  const b = await saveIdea("u1", "idea-b");
  assert.equal(a.kind, "saved");
  assert.equal(b.kind, "saved");

  const rows = await listSavedIdeas("u1");
  assert.equal(rows.length, 2);
  const ideaIds = rows.map((r) => r.ideaId).sort();
  assert.deepEqual(ideaIds, ["idea-a", "idea-b"]);
});

// ---------------------------------------------------------------------------
// Unsave
// ---------------------------------------------------------------------------

test("unsaveIdea removes the row when a save exists", async () => {
  await saveIdea("u1", "idea-1");
  const result = await unsaveIdea("u1", "idea-1");
  assert.equal(result.kind, "removed");

  const rows = await listSavedIdeas("u1");
  assert.deepEqual(rows, []);
});

test("unsaveIdea returns 'not-found' when no save exists", async () => {
  const result = await unsaveIdea("u1", "idea-nonexistent");
  assert.equal(result.kind, "not-found");
});

test("unsaveIdea is idempotent — calling twice still leaves an empty list", async () => {
  await saveIdea("u1", "idea-1");
  const first = await unsaveIdea("u1", "idea-1");
  const second = await unsaveIdea("u1", "idea-1");
  assert.equal(first.kind, "removed");
  assert.equal(second.kind, "not-found");

  const rows = await listSavedIdeas("u1");
  assert.deepEqual(rows, []);
});

// ---------------------------------------------------------------------------
// User isolation — userA's saves must not leak into userB's list, and the
// global JSONL must contain both rows side-by-side.
// ---------------------------------------------------------------------------

test("listSavedIdeas isolates users — userA saves do not appear in userB list", async () => {
  await saveIdea("userA", "idea-shared");
  await saveIdea("userB", "idea-shared");
  await saveIdea("userA", "idea-only-a");

  const aRows = await listSavedIdeas("userA");
  const bRows = await listSavedIdeas("userB");

  assert.equal(aRows.length, 2);
  const aIdeas = aRows.map((r) => r.ideaId).sort();
  assert.deepEqual(aIdeas, ["idea-only-a", "idea-shared"]);

  assert.equal(bRows.length, 1);
  assert.equal(bRows[0].ideaId, "idea-shared");
  assert.equal(bRows[0].userId, "userB");
});

test("unsaveIdea isolates users — userA's unsave does not affect userB", async () => {
  await saveIdea("userA", "idea-shared");
  await saveIdea("userB", "idea-shared");

  const result = await unsaveIdea("userA", "idea-shared");
  assert.equal(result.kind, "removed");

  const aRows = await listSavedIdeas("userA");
  const bRows = await listSavedIdeas("userB");
  assert.deepEqual(aRows, []);
  assert.equal(bRows.length, 1, "userB's save survives userA's unsave");
  assert.equal(bRows[0].userId, "userB");
});
