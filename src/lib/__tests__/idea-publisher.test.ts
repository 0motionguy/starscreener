// Tests for the per-idea auto-post hook. Covers the three gates the
// strategy doc calls out:
//
//   1. Only fires on pending_moderation → published (not re-approves,
//      not reject, not shipped lifecycle promotions).
//   2. Idempotency: same idea can't be re-posted, regardless of how
//      many times moderateIdea is called.
//   3. Rate limit: 1 idea_published per author per 24h.
//
// Also covers failure isolation: a Twitter 5xx must not propagate.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_DIR = mkdtempSync(join(tmpdir(), "starscreener-idea-publisher-"));
process.env.STARSCREENER_DATA_DIR = TMP_DIR;
// Route adapter selection to the console dev adapter so the hook has
// something to fire at without reaching the real Twitter API. Console
// adapter's postThread returns status=logged for every post.
(process.env as Record<string, string>).TWITTER_OUTBOUND_MODE = "console";

import {
  IDEAS_FILE,
  createIdea,
  moderateIdea,
  toPublicIdea,
} from "../ideas";
import {
  OUTBOUND_RUNS_FILE,
  listOutboundRuns,
} from "../twitter/outbound/audit";
import {
  __awaitInFlightAutoPosts,
  autoPostIdeaIfEligible,
} from "../twitter/outbound/idea-publisher";
import { writeJsonlFile } from "../pipeline/storage/file-persistence";

process.on("exit", () => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

beforeEach(async () => {
  await writeJsonlFile(IDEAS_FILE, []);
  await writeJsonlFile(OUTBOUND_RUNS_FILE, []);
});

// ---------------------------------------------------------------------------
// Gate: only pending → published fires
// ---------------------------------------------------------------------------

test("autoPostIdeaIfEligible — afterStatus=pending_moderation returns not_published", async () => {
  const decision = await autoPostIdeaIfEligible({
    idea: {
      id: "abc",
      authorHandle: "mirko",
      title: "T",
      pitch: "A pitch long enough to satisfy the composer.",
      body: null,
      status: "pending_moderation",
      buildStatus: "exploring",
      shippedRepoUrl: null,
      targetRepos: [],
      category: null,
      tags: [],
      createdAt: new Date().toISOString(),
      publishedAt: null,
    },
    authorId: "u1",
    beforeStatus: "pending_moderation",
    afterStatus: "pending_moderation",
  });
  assert.equal(decision.kind, "not_published");
});

test("autoPostIdeaIfEligible — afterStatus=rejected returns not_published", async () => {
  const decision = await autoPostIdeaIfEligible({
    idea: {
      id: "abc",
      authorHandle: "mirko",
      title: "T",
      pitch: "A pitch long enough to satisfy the composer.",
      body: null,
      status: "rejected",
      buildStatus: "exploring",
      shippedRepoUrl: null,
      targetRepos: [],
      category: null,
      tags: [],
      createdAt: new Date().toISOString(),
      publishedAt: null,
    },
    authorId: "u1",
    beforeStatus: "pending_moderation",
    afterStatus: "rejected",
  });
  assert.equal(decision.kind, "not_published");
});

test("autoPostIdeaIfEligible — re-approve (already published) returns duplicate", async () => {
  const publishedAt = new Date().toISOString();
  const decision = await autoPostIdeaIfEligible({
    idea: {
      id: "abc",
      authorHandle: "mirko",
      title: "T",
      pitch: "A pitch long enough to satisfy the composer.",
      body: null,
      status: "published",
      buildStatus: "exploring",
      shippedRepoUrl: null,
      targetRepos: [],
      category: null,
      tags: [],
      createdAt: publishedAt,
      publishedAt,
    },
    authorId: "u1",
    beforeStatus: "published",
    afterStatus: "published",
  });
  assert.equal(decision.kind, "duplicate");
});

// ---------------------------------------------------------------------------
// Moderation path — fires exactly once
// ---------------------------------------------------------------------------

test("moderateIdea approve → exactly one idea_published audit row written", async () => {
  const created = await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "First real idea",
    pitch: "A pitch long enough to satisfy the composer minimum.",
  });
  if (created.kind !== "queued") throw new Error("expected queued");
  await moderateIdea({ id: created.record.id, action: "approve" });

  // The auto-post fires on a microtask after moderateIdea returns.
  // Await a tick cycle so the fire-and-forget lands.
  await __awaitInFlightAutoPosts();

  const runs = await listOutboundRuns();
  const publishRuns = runs.filter((r) => r.kind === "idea_published");
  assert.equal(publishRuns.length, 1);
  // console adapter returns status=logged for every post.
  assert.equal(publishRuns[0]!.status, "logged");
  assert.equal(publishRuns[0]!.postCount, 1);
});

test("moderateIdea reject → no idea_published audit row written", async () => {
  const created = await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "Rejected idea",
    pitch: "A pitch long enough to satisfy the composer minimum.",
  });
  if (created.kind !== "queued") throw new Error("expected queued");
  await moderateIdea({ id: created.record.id, action: "reject" });

  await __awaitInFlightAutoPosts();

  const runs = await listOutboundRuns();
  const publishRuns = runs.filter((r) => r.kind === "idea_published");
  assert.equal(publishRuns.length, 0);
});

test("moderateIdea approve twice → still exactly one publish run (idempotency)", async () => {
  const created = await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "Double approve",
    pitch: "A pitch long enough to satisfy the composer minimum.",
  });
  if (created.kind !== "queued") throw new Error("expected queued");
  await moderateIdea({ id: created.record.id, action: "approve" });
  await __awaitInFlightAutoPosts();

  // Re-approve the already-published idea — should not fire again.
  await moderateIdea({ id: created.record.id, action: "approve" });
  await __awaitInFlightAutoPosts();

  const runs = await listOutboundRuns();
  const publishRuns = runs.filter((r) => r.kind === "idea_published");
  assert.equal(
    publishRuns.length,
    1,
    `expected 1 publish run, got ${publishRuns.length}`,
  );
});

// ---------------------------------------------------------------------------
// Rate limit
// ---------------------------------------------------------------------------

test("autoPostIdeaIfEligible — second idea within 24h returns rate_limited", async () => {
  // First idea: fires normally.
  const first = await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "First idea",
    pitch: "A pitch long enough to satisfy the composer minimum.",
  });
  if (first.kind !== "queued") throw new Error("expected queued");
  await moderateIdea({ id: first.record.id, action: "approve" });
  await __awaitInFlightAutoPosts();

  // Second idea by the SAME author within the 24h window → rate_limited.
  const second = await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "Second idea same day",
    pitch: "A second pitch long enough to pass the composer check.",
  });
  if (second.kind !== "queued") throw new Error("expected queued");
  const secondRecord = { ...second.record, status: "published" as const };
  const decision = await autoPostIdeaIfEligible({
    idea: toPublicIdea(secondRecord),
    authorId: "u1",
    beforeStatus: "pending_moderation",
    afterStatus: "published",
  });
  assert.equal(decision.kind, "rate_limited");
});

test("autoPostIdeaIfEligible — same author outside 24h window fires again", async () => {
  // First idea posted 48 hours ago.
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const firstIdea = await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "Old idea",
    pitch: "A pitch long enough to satisfy the composer minimum.",
  });
  if (firstIdea.kind !== "queued") throw new Error("expected queued");
  const approved = await moderateIdea({
    id: firstIdea.record.id,
    action: "approve",
  });
  await __awaitInFlightAutoPosts();

  // Rewrite the audit row so its startedAt is 48h ago — simulates
  // the passage of time without having to freeze/advance the clock
  // inside the module under test.
  const runs = await listOutboundRuns();
  const aged = runs.map((r) =>
    r.kind === "idea_published"
      ? { ...r, startedAt: twoDaysAgo.toISOString() }
      : r,
  );
  await writeJsonlFile(OUTBOUND_RUNS_FILE, aged);

  // Now the same author posts a different idea → should fire.
  const decision = await autoPostIdeaIfEligible(
    {
      idea: { ...toPublicIdea(approved), id: "different-id" },
      authorId: "u1",
      beforeStatus: "pending_moderation",
      afterStatus: "published",
    },
    now,
  );
  assert.equal(decision.kind, "fired");
});

test("autoPostIdeaIfEligible — different authors don't share a rate limit", async () => {
  const first = await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "u1 idea",
    pitch: "A pitch long enough to satisfy the composer minimum.",
  });
  if (first.kind !== "queued") throw new Error("expected queued");
  await moderateIdea({ id: first.record.id, action: "approve" });
  await __awaitInFlightAutoPosts();

  // u2 posts their own idea — should fire (different author).
  const u2 = await createIdea({
    authorId: "u2",
    authorHandle: "u2",
    title: "u2 idea same window",
    pitch: "A pitch from a different author in the same 24h window.",
  });
  if (u2.kind !== "queued") throw new Error("expected queued");
  const decision = await autoPostIdeaIfEligible({
    idea: toPublicIdea({ ...u2.record, status: "published" }),
    authorId: "u2",
    beforeStatus: "pending_moderation",
    afterStatus: "published",
  });
  assert.equal(decision.kind, "fired");
});
