// Tests for src/lib/repo-ideas.ts — filters ideas.jsonl + (optionally)
// reactions.jsonl to the set of community ideas targeting a given repo.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_DIR = mkdtempSync(
  join(tmpdir(), "starscreener-repo-ideas-test-"),
);
process.env.STARSCREENER_DATA_DIR = TMP_DIR;

import {
  IDEAS_FILE,
  REACTIONS_FILE,
  __resetRepoIdeasCacheForTests,
  getIdeasForRepo,
} from "../../repo-ideas";

process.on("exit", () => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

let nextMtime = Date.now();

function bumpMtime(path: string): void {
  nextMtime += 1000;
  const when = new Date(nextMtime);
  utimesSync(path, when, when);
}

function writeIdeas(rows: Record<string, unknown>[]): void {
  const path = join(TMP_DIR, IDEAS_FILE);
  writeFileSync(
    path,
    rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""),
    "utf8",
  );
  bumpMtime(path);
}

function writeReactions(rows: Record<string, unknown>[]): void {
  const path = join(TMP_DIR, REACTIONS_FILE);
  writeFileSync(
    path,
    rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""),
    "utf8",
  );
  bumpMtime(path);
}

function idea(overrides: Partial<Record<string, unknown>> = {}): Record<
  string,
  unknown
> {
  return {
    id: "abc123",
    authorHandle: "alice",
    title: "A brilliant idea",
    pitch: "Build a thing that does the other thing.",
    status: "published",
    buildStatus: "exploring",
    targetRepos: ["vercel/next.js"],
    createdAt: "2026-04-20T12:00:00.000Z",
    publishedAt: "2026-04-20T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  __resetRepoIdeasCacheForTests();
  writeFileSync(join(TMP_DIR, IDEAS_FILE), "", "utf8");
  writeFileSync(join(TMP_DIR, REACTIONS_FILE), "", "utf8");
});

// ---------------------------------------------------------------------------
// Missing / empty store
// ---------------------------------------------------------------------------

test("returns [] when the ideas file is empty", () => {
  __resetRepoIdeasCacheForTests();
  const result = getIdeasForRepo("vercel/next.js");
  assert.deepEqual(result, []);
});

test("returns [] when no idea targets this repo", () => {
  writeIdeas([idea({ targetRepos: ["facebook/react"] })]);
  __resetRepoIdeasCacheForTests();
  const result = getIdeasForRepo("vercel/next.js");
  assert.deepEqual(result, []);
});

test("returns [] when targeting idea is still pending_moderation", () => {
  writeIdeas([idea({ status: "pending_moderation" })]);
  __resetRepoIdeasCacheForTests();
  const result = getIdeasForRepo("vercel/next.js");
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// Case-insensitive filter
// ---------------------------------------------------------------------------

test("filters targetRepos case-insensitively", () => {
  writeIdeas([
    idea({ id: "one", targetRepos: ["Vercel/Next.js"] }),
    idea({ id: "two", targetRepos: ["VERCEL/NEXT.JS"] }),
  ]);
  __resetRepoIdeasCacheForTests();
  const result = getIdeasForRepo("vercel/next.js");
  assert.equal(result.length, 2);
});

// ---------------------------------------------------------------------------
// Sort desc + cap at 5
// ---------------------------------------------------------------------------

test("sorts by createdAt desc and caps at 5", () => {
  const rows = Array.from({ length: 7 }).map((_, i) =>
    idea({
      id: `idea-${i}`,
      title: `Idea ${i}`,
      createdAt: `2026-04-${String(10 + i).padStart(2, "0")}T00:00:00.000Z`,
    }),
  );
  writeIdeas(rows);
  __resetRepoIdeasCacheForTests();

  const result = getIdeasForRepo("vercel/next.js");
  assert.equal(result.length, 5);
  // Top is the newest (index 6 → 2026-04-16), then index 5, 4, 3, 2.
  assert.equal(result[0]!.id, "idea-6");
  assert.equal(result[1]!.id, "idea-5");
  assert.equal(result[2]!.id, "idea-4");
  assert.equal(result[3]!.id, "idea-3");
  assert.equal(result[4]!.id, "idea-2");
});

// ---------------------------------------------------------------------------
// Reaction fold-in
// ---------------------------------------------------------------------------

test("folds in reaction counts when reactions.jsonl has matching rows", () => {
  writeIdeas([idea({ id: "idea-a" })]);
  writeReactions([
    {
      id: "r1",
      userId: "u1",
      objectType: "idea",
      objectId: "idea-a",
      reactionType: "build",
      createdAt: "2026-04-21T00:00:00.000Z",
    },
    {
      id: "r2",
      userId: "u2",
      objectType: "idea",
      objectId: "idea-a",
      reactionType: "build",
      createdAt: "2026-04-21T01:00:00.000Z",
    },
    {
      id: "r3",
      userId: "u3",
      objectType: "idea",
      objectId: "idea-a",
      reactionType: "use",
      createdAt: "2026-04-21T02:00:00.000Z",
    },
    // A reaction on a different object must not leak into the idea count.
    {
      id: "r4",
      userId: "u4",
      objectType: "repo",
      objectId: "vercel/next.js",
      reactionType: "use",
      createdAt: "2026-04-21T03:00:00.000Z",
    },
  ]);
  __resetRepoIdeasCacheForTests();

  const result = getIdeasForRepo("vercel/next.js");
  assert.equal(result.length, 1);
  const item = result[0]!;
  assert.ok(item.reactions);
  assert.equal(item.reactions!.build, 2);
  assert.equal(item.reactions!.use, 1);
  assert.equal(item.reactions!.buy, undefined);
  assert.equal(item.reactions!.invest, undefined);
});

test("omits reactions object entirely when no counts are present", () => {
  writeIdeas([idea({ id: "idea-none" })]);
  __resetRepoIdeasCacheForTests();

  const result = getIdeasForRepo("vercel/next.js");
  assert.equal(result.length, 1);
  assert.equal(result[0]!.reactions, undefined);
});

// ---------------------------------------------------------------------------
// Public shape sanity
// ---------------------------------------------------------------------------

test("maps pitch → summary, exposes url, author, createdAt", () => {
  writeIdeas([idea({ id: "abc", pitch: "Short pitch." })]);
  __resetRepoIdeasCacheForTests();

  const result = getIdeasForRepo("vercel/next.js");
  assert.equal(result.length, 1);
  const item = result[0]!;
  assert.equal(item.id, "abc");
  assert.equal(item.summary, "Short pitch.");
  assert.equal(item.author, "alice");
  assert.equal(item.createdAt, "2026-04-20T12:00:00.000Z");
  assert.equal(item.url, "/ideas/abc");
});
