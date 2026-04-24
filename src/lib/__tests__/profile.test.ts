// Profile aggregator tests. Covers the three data sources the
// projection pulls from:
//
//   - Ideas authored by this handle (published/shipped only; pending
//     and rejected are hidden from public profiles).
//   - Shipped repos (ideas with buildStatus=shipped + shippedRepoUrl).
//   - Reactions given (count per type + recent list, capped).

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_DIR = mkdtempSync(join(tmpdir(), "starscreener-profile-test-"));
process.env.STARSCREENER_DATA_DIR = TMP_DIR;
// Keep the idea-published hook silent during setup — it'd otherwise
// fire on every moderateIdea call. Null adapter = no-op + audit
// skipped status; doesn't affect the profile aggregation.
(process.env as Record<string, string>).TWITTER_OUTBOUND_MODE = "null";

import {
  IDEAS_FILE,
  createIdea,
  moderateIdea,
  updateIdeaLifecycle,
} from "../ideas";
import { REACTIONS_FILE, toggleReaction } from "../reactions";
import { getProfile } from "../profile";
import { writeJsonlFile } from "../pipeline/storage/file-persistence";
import { OUTBOUND_RUNS_FILE } from "../twitter/outbound/audit";

process.on("exit", () => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

beforeEach(async () => {
  await writeJsonlFile(IDEAS_FILE, []);
  await writeJsonlFile(REACTIONS_FILE, []);
  await writeJsonlFile(OUTBOUND_RUNS_FILE, []);
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

test("getProfile returns exists=false for a handle with no activity", async () => {
  const profile = await getProfile("ghost");
  assert.equal(profile.exists, false);
  assert.equal(profile.ideas.length, 0);
  assert.equal(profile.shippedRepos.length, 0);
  assert.equal(profile.reactionsGiven.total, 0);
});

test("getProfile normalizes leading/trailing whitespace in the handle", async () => {
  const created = await createIdea({
    authorId: "alice",
    authorHandle: "alice",
    title: "An idea from alice",
    pitch: "A pitch long enough to satisfy the composer minimum length.",
  });
  if (created.kind !== "queued") throw new Error("expected queued");
  await moderateIdea({ id: created.record.id, action: "approve" });

  const profile = await getProfile("  alice  ");
  assert.equal(profile.handle, "alice");
  assert.equal(profile.exists, true);
});

// ---------------------------------------------------------------------------
// Ideas visibility
// ---------------------------------------------------------------------------

test("getProfile shows only published/shipped ideas, not pending or rejected", async () => {
  const pending = await createIdea({
    authorId: "bob",
    authorHandle: "bob",
    title: "Pending idea",
    pitch: "A pitch long enough to satisfy the composer minimum length.",
  });
  const rejectedRaw = await createIdea({
    authorId: "bob",
    authorHandle: "bob",
    title: "Rejected idea",
    pitch: "Another pitch long enough to pass the composer validation.",
  });
  const publishedRaw = await createIdea({
    authorId: "bob",
    authorHandle: "bob",
    title: "Published idea",
    pitch: "Third pitch that is definitely long enough to pass the composer.",
  });
  if (
    pending.kind !== "queued" ||
    rejectedRaw.kind !== "queued" ||
    publishedRaw.kind !== "queued"
  ) {
    throw new Error("expected queued");
  }
  await moderateIdea({ id: rejectedRaw.record.id, action: "reject" });
  await moderateIdea({ id: publishedRaw.record.id, action: "approve" });

  const profile = await getProfile("bob");
  assert.equal(profile.ideas.length, 1);
  assert.equal(profile.ideas[0]?.title, "Published idea");
});

test("getProfile orders ideas by publishedAt desc (newest first)", async () => {
  const first = await createIdea({
    authorId: "carol",
    authorHandle: "carol",
    title: "First idea",
    pitch: "A pitch long enough to satisfy the composer minimum length.",
  });
  const second = await createIdea({
    authorId: "carol",
    authorHandle: "carol",
    title: "Second idea",
    pitch: "Another pitch long enough to pass the composer validation.",
  });
  if (first.kind !== "queued" || second.kind !== "queued") {
    throw new Error("expected queued");
  }
  await moderateIdea({ id: first.record.id, action: "approve" });
  // Advance clock — the second approval should happen later.
  await new Promise((r) => setTimeout(r, 10));
  await moderateIdea({ id: second.record.id, action: "approve" });

  const profile = await getProfile("carol");
  assert.equal(profile.ideas[0]?.title, "Second idea");
  assert.equal(profile.ideas[1]?.title, "First idea");
});

// ---------------------------------------------------------------------------
// Shipped repos
// ---------------------------------------------------------------------------

test("getProfile includes shipped repos with their URL", async () => {
  const created = await createIdea({
    authorId: "dan",
    authorHandle: "dan",
    title: "Thing to ship",
    pitch: "A pitch long enough to pass validation before being shipped.",
  });
  if (created.kind !== "queued") throw new Error("expected queued");
  await moderateIdea({ id: created.record.id, action: "approve" });
  await updateIdeaLifecycle({
    id: created.record.id,
    authorId: "dan",
    buildStatus: "shipped",
    shippedRepoUrl: "https://github.com/dan/built-it",
  });

  const profile = await getProfile("dan");
  assert.equal(profile.shippedRepos.length, 1);
  assert.equal(
    profile.shippedRepos[0]?.repoUrl,
    "https://github.com/dan/built-it",
  );
  assert.equal(profile.shippedRepos[0]?.ideaTitle, "Thing to ship");
});

test("getProfile excludes shipped-but-no-URL from shippedRepos", async () => {
  const created = await createIdea({
    authorId: "eve",
    authorHandle: "eve",
    title: "Shipped but no repo",
    pitch: "A pitch long enough to pass validation before being shipped.",
  });
  if (created.kind !== "queued") throw new Error("expected queued");
  await moderateIdea({ id: created.record.id, action: "approve" });
  await updateIdeaLifecycle({
    id: created.record.id,
    authorId: "eve",
    buildStatus: "shipped",
    // shippedRepoUrl intentionally not provided
  });

  const profile = await getProfile("eve");
  assert.equal(profile.shippedRepos.length, 0);
});

// ---------------------------------------------------------------------------
// Reactions given
// ---------------------------------------------------------------------------

test("getProfile tallies reactions given by type", async () => {
  await toggleReaction({
    userId: "frank",
    objectType: "repo",
    objectId: "a/a",
    reactionType: "build",
  });
  await toggleReaction({
    userId: "frank",
    objectType: "repo",
    objectId: "a/a",
    reactionType: "buy",
  });
  await toggleReaction({
    userId: "frank",
    objectType: "repo",
    objectId: "b/b",
    reactionType: "build",
  });
  await toggleReaction({
    userId: "frank",
    objectType: "repo",
    objectId: "c/c",
    reactionType: "invest",
  });

  const profile = await getProfile("frank");
  assert.equal(profile.reactionsGiven.build, 2);
  assert.equal(profile.reactionsGiven.buy, 1);
  assert.equal(profile.reactionsGiven.invest, 1);
  assert.equal(profile.reactionsGiven.use, 0);
  assert.equal(profile.reactionsGiven.total, 4);
});

test("getProfile does not count OTHER users' reactions", async () => {
  await toggleReaction({
    userId: "gina",
    objectType: "repo",
    objectId: "x/x",
    reactionType: "build",
  });
  await toggleReaction({
    userId: "henry",
    objectType: "repo",
    objectId: "x/x",
    reactionType: "build",
  });

  const ginaProfile = await getProfile("gina");
  assert.equal(ginaProfile.reactionsGiven.total, 1);
  const henryProfile = await getProfile("henry");
  assert.equal(henryProfile.reactionsGiven.total, 1);
});

test("getProfile exists=true if user has reacted, even with no ideas", async () => {
  await toggleReaction({
    userId: "lurker",
    objectType: "repo",
    objectId: "x/x",
    reactionType: "use",
  });
  const profile = await getProfile("lurker");
  assert.equal(profile.exists, true);
  assert.equal(profile.ideas.length, 0);
  assert.equal(profile.reactionsGiven.use, 1);
});

test("getProfile caps recentReactions at 50", async () => {
  for (let i = 0; i < 55; i++) {
    // Toggling 55 distinct objects so each creates a row (not a
    // toggle-off of the same).
    await toggleReaction({
      userId: "prolific",
      objectType: "repo",
      objectId: `owner/repo-${i}`,
      reactionType: "build",
    });
  }
  const profile = await getProfile("prolific");
  assert.equal(profile.reactionsGiven.build, 55);
  assert.equal(profile.recentReactions.length, 50);
});
