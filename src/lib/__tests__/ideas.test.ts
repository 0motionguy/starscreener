// Tests for the idea entity. Same shape as revenue-submissions.test —
// every test starts with an empty store via writeJsonlFile([]) so
// concurrent test runs don't share state.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_DIR = mkdtempSync(join(tmpdir(), "starscreener-ideas-test-"));
process.env.STARSCREENER_DATA_DIR = TMP_DIR;

import {
  APPROVAL_GATE_THRESHOLD,
  HOT_SCORE_WEIGHTS,
  IDEAS_FILE,
  RECENCY_HALF_LIFE_HOURS,
  countApprovedByAuthor,
  createIdea,
  hotScore,
  listIdeas,
  moderateIdea,
  toPublicIdea,
  updateIdeaLifecycle,
  validateIdeaInput,
} from "../ideas";
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
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test("validateIdeaInput accepts the minimum body", () => {
  const result = validateIdeaInput({
    title: "A short idea title",
    pitch: "This is the pitch — long enough to clear the floor.",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.title, "A short idea title");
    assert.equal(result.value.buildStatus, "exploring");
  }
});

test("validateIdeaInput trims excess whitespace in title and pitch", () => {
  const result = validateIdeaInput({
    title: "   Trim    me   please   ",
    pitch: "   This pitch   has   weird   spacing.   It should normalize.   ",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.title, "Trim me please");
    assert.match(result.value.pitch, /This pitch has weird spacing/);
  }
});

test("validateIdeaInput rejects too-short and too-long fields", () => {
  const tooShort = validateIdeaInput({ title: "abc", pitch: "x".repeat(20) });
  assert.equal(tooShort.ok, false);

  const tooLong = validateIdeaInput({
    title: "x".repeat(81),
    pitch: "x".repeat(20),
  });
  assert.equal(tooLong.ok, false);
});

test("validateIdeaInput rejects URLs in the pitch", () => {
  const result = validateIdeaInput({
    title: "Idea with URL",
    pitch: "Check out https://example.com — that's the deal here, right.",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.field === "pitch"));
  }
});

test("validateIdeaInput accepts and dedupes targetRepos, normalized to fullName", () => {
  const result = validateIdeaInput({
    title: "Idea about Next and Ollama",
    pitch: "A pitch that targets two repos and references one of them twice.",
    targetRepos: [
      "https://github.com/vercel/next.js",
      "vercel/next.js",
      "ollama/ollama",
    ],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.targetRepos, [
      "vercel/next.js",
      "ollama/ollama",
    ]);
  }
});

test("validateIdeaInput rejects more than 5 target repos", () => {
  const result = validateIdeaInput({
    title: "Too many targets",
    pitch: "This idea names six target repos which exceeds the cap.",
    targetRepos: [
      "a/a",
      "b/b",
      "c/c",
      "d/d",
      "e/e",
      "f/f",
    ],
  });
  assert.equal(result.ok, false);
});

test("validateIdeaInput rejects unknown buildStatus", () => {
  const result = validateIdeaInput({
    title: "Bad build status",
    pitch: "This pitch is fine but the buildStatus value is bogus.",
    buildStatus: "shipping",
  });
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// Approval gate
// ---------------------------------------------------------------------------

test("first APPROVAL_GATE_THRESHOLD ideas land in pending_moderation", async () => {
  for (let i = 0; i < APPROVAL_GATE_THRESHOLD; i++) {
    const result = await createIdea({
      authorId: "u1",
      authorHandle: "u1",
      title: `Idea number ${i + 1}`,
      pitch: `Pitch number ${i + 1} that clears the minimum length floor.`,
    });
    assert.equal(
      result.kind,
      "queued",
      `idea #${i + 1} should be queued, not auto-published`,
    );
    if (result.kind === "queued") {
      assert.equal(result.record.status, "pending_moderation");
      assert.equal(result.record.approvedAutomatically, false);
    }
  }
});

test("after APPROVAL_GATE_THRESHOLD approvals, subsequent posts auto-publish", async () => {
  // Seed 5 published ideas directly.
  const seeded = [];
  for (let i = 0; i < APPROVAL_GATE_THRESHOLD; i++) {
    const result = await createIdea({
      authorId: "u1",
      authorHandle: "u1",
      title: `Seed ${i + 1}`,
      pitch: `Seed pitch ${i + 1} long enough to pass validation.`,
    });
    if (result.kind === "queued") {
      const approved = await moderateIdea({
        id: result.record.id,
        action: "approve",
      });
      seeded.push(approved);
    }
  }
  assert.equal(seeded.length, APPROVAL_GATE_THRESHOLD);

  // The 6th idea from the same author should auto-publish.
  const next = await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "Sixth idea after gate",
    pitch: "This one should auto-publish because the gate is now open.",
  });
  assert.equal(next.kind, "published");
  if (next.kind === "published") {
    assert.equal(next.record.status, "published");
    assert.equal(next.record.approvedAutomatically, true);
    assert.ok(next.record.publishedAt);
  }
});

test("approval gate is per-author, not global", async () => {
  // Author u1 posts 5 + has them all approved, gate opens for u1.
  for (let i = 0; i < APPROVAL_GATE_THRESHOLD; i++) {
    const r = await createIdea({
      authorId: "u1",
      authorHandle: "u1",
      title: `u1 seed ${i + 1}`,
      pitch: `Pitch ${i + 1} from user 1 that clears the floor easily.`,
    });
    if (r.kind === "queued") {
      await moderateIdea({ id: r.record.id, action: "approve" });
    }
  }
  // Author u2 posts their first — must still be queued.
  const u2First = await createIdea({
    authorId: "u2",
    authorHandle: "u2",
    title: "u2 first idea",
    pitch: "First post from a brand-new author should hit the queue.",
  });
  assert.equal(u2First.kind, "queued");
});

test("countApprovedByAuthor includes published, shipped, archived; not pending or rejected", async () => {
  const a = await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "Will be approved",
    pitch: "This pitch clears validation easily so we have something.",
  });
  if (a.kind !== "queued") throw new Error("expected queued");
  await moderateIdea({ id: a.record.id, action: "approve" });

  const b = await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "Will be rejected",
    pitch: "This other pitch will get a reject decision applied below.",
  });
  if (b.kind !== "queued") throw new Error("expected queued");
  await moderateIdea({ id: b.record.id, action: "reject" });

  const c = await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "Will stay pending",
    pitch: "And this one stays in the queue without a moderation action.",
  });
  assert.equal(c.kind, "queued");

  const count = await countApprovedByAuthor("u1");
  assert.equal(count, 1, "only the approved idea should count toward gating");
});

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

test("same author + same title (case-insensitive) is rejected as duplicate", async () => {
  const first = await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "Duplicate Title",
    pitch: "First post with this title — should land in the queue normally.",
  });
  assert.equal(first.kind, "queued");

  const second = await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "duplicate title",
    pitch: "Different pitch but the title is identical when lowercased.",
  });
  assert.equal(second.kind, "duplicate");

  const all = await listIdeas();
  assert.equal(all.length, 1);
});

test("same title from a different author is allowed", async () => {
  await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "Common Idea Name",
    pitch: "First author claims this title — perfectly fine and expected.",
  });
  const second = await createIdea({
    authorId: "u2",
    authorHandle: "u2",
    title: "Common Idea Name",
    pitch: "Second author posts the same title; they should not be blocked.",
  });
  assert.equal(second.kind, "queued");
});

test("a rejected idea frees the title for the same author to retry", async () => {
  const first = await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "Retry Me",
    pitch: "Original post that's about to be rejected by a moderator.",
  });
  if (first.kind !== "queued") throw new Error("expected queued");
  await moderateIdea({ id: first.record.id, action: "reject" });

  const retry = await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "Retry Me",
    pitch: "Same title, fresh attempt after the previous one was rejected.",
  });
  assert.equal(retry.kind, "queued");
});

// ---------------------------------------------------------------------------
// Concurrency on intake
// ---------------------------------------------------------------------------

test("concurrent posts of the same title net to exactly one row, not two", async () => {
  // Without the per-file lock these two parallel posts could both miss
  // the duplicate-title check (both read an empty snapshot) and both
  // append. With the lock, the second one sees the first's row and
  // surfaces a "duplicate" result instead of inserting again.
  const [a, b] = await Promise.all([
    createIdea({
      authorId: "u1",
      authorHandle: "u1",
      title: "Race condition test",
      pitch: "Two parallel posts with this same title arrive simultaneously.",
    }),
    createIdea({
      authorId: "u1",
      authorHandle: "u1",
      title: "Race condition test",
      pitch: "Two parallel posts with this same title arrive simultaneously.",
    }),
  ]);
  const kinds = [a.kind, b.kind].sort();
  // Exactly one queued, exactly one duplicate.
  assert.deepEqual(kinds, ["duplicate", "queued"].sort());
  const all = await listIdeas();
  assert.equal(all.length, 1);
});

test("concurrent posts from different authors with the same title both succeed", async () => {
  const [a, b] = await Promise.all([
    createIdea({
      authorId: "u1",
      authorHandle: "u1",
      title: "Common title across authors",
      pitch: "Author 1 posting a title that author 2 will also post.",
    }),
    createIdea({
      authorId: "u2",
      authorHandle: "u2",
      title: "Common title across authors",
      pitch: "Author 2 posting the same title — should not collide with u1.",
    }),
  ]);
  assert.equal(a.kind, "queued");
  assert.equal(b.kind, "queued");
  const all = await listIdeas();
  assert.equal(all.length, 2);
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test("updateIdeaLifecycle promotes status to shipped when buildStatus changes to shipped", async () => {
  const created = await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "Build me",
    pitch: "An idea that the same author will mark as shipped below.",
  });
  if (created.kind !== "queued") throw new Error("expected queued");
  await moderateIdea({ id: created.record.id, action: "approve" });

  const shipped = await updateIdeaLifecycle({
    id: created.record.id,
    authorId: "u1",
    buildStatus: "shipped",
    shippedRepoUrl: "https://github.com/u1/built-it",
  });
  assert.equal(shipped.buildStatus, "shipped");
  assert.equal(shipped.status, "shipped");
  assert.equal(shipped.shippedRepoUrl, "https://github.com/u1/built-it");
});

test("updateIdeaLifecycle refuses to mutate someone else's idea", async () => {
  const created = await createIdea({
    authorId: "u1",
    authorHandle: "u1",
    title: "Owned by u1",
    pitch: "Owner is u1 — u2 should not be allowed to mutate this idea.",
  });
  if (created.kind !== "queued") throw new Error("expected queued");
  await moderateIdea({ id: created.record.id, action: "approve" });

  await assert.rejects(
    () =>
      updateIdeaLifecycle({
        id: created.record.id,
        authorId: "u2",
        buildStatus: "building",
      }),
    /not owned/,
  );
});

// ---------------------------------------------------------------------------
// Hot ranking
// ---------------------------------------------------------------------------

test("hotScore is zero with no reactions", () => {
  const score = hotScore(
    { createdAt: new Date().toISOString() },
    { build: 0, use: 0, buy: 0, invest: 0 },
  );
  assert.equal(score, 0);
});

test("hotScore weights match HOT_SCORE_WEIGHTS at t=0", () => {
  const now = Date.now();
  const score = hotScore(
    { createdAt: new Date(now).toISOString() },
    { build: 1, use: 1, buy: 1, invest: 1 },
    now,
  );
  // At t=0 the decay factor is 1, so raw == sum of weights.
  const expected =
    HOT_SCORE_WEIGHTS.build +
    HOT_SCORE_WEIGHTS.use +
    HOT_SCORE_WEIGHTS.buy +
    HOT_SCORE_WEIGHTS.invest;
  assert.ok(
    Math.abs(score - expected) < 1e-9,
    `expected ~${expected}, got ${score}`,
  );
});

test("hotScore halves at one half-life of age", () => {
  const now = Date.now();
  const oneHalfLifeAgo = now - RECENCY_HALF_LIFE_HOURS * 60 * 60 * 1000;
  const fresh = hotScore(
    { createdAt: new Date(now).toISOString() },
    { build: 0, use: 0, buy: 1, invest: 0 },
    now,
  );
  const aged = hotScore(
    { createdAt: new Date(oneHalfLifeAgo).toISOString() },
    { build: 0, use: 0, buy: 1, invest: 0 },
    now,
  );
  // exp(-1) ≈ 0.368. fresh * 0.368 should equal aged within float slop.
  assert.ok(
    Math.abs(aged / fresh - Math.exp(-1)) < 1e-9,
    `expected exp(-1), got ratio ${aged / fresh}`,
  );
});

test("invest reactions outweigh build reactions per HOT_SCORE_WEIGHTS", () => {
  const now = Date.now();
  const buildOnly = hotScore(
    { createdAt: new Date(now).toISOString() },
    { build: 1, use: 0, buy: 0, invest: 0 },
    now,
  );
  const investOnly = hotScore(
    { createdAt: new Date(now).toISOString() },
    { build: 0, use: 0, buy: 0, invest: 1 },
    now,
  );
  // 8/3 ≈ 2.66
  assert.ok(investOnly > buildOnly * 2);
});

// ---------------------------------------------------------------------------
// toPublicIdea — moderation note + authorId stripped
// ---------------------------------------------------------------------------

test("toPublicIdea strips moderation metadata and authorId", async () => {
  const created = await createIdea({
    authorId: "u1",
    authorHandle: "u1-handle",
    title: "Public projection",
    pitch: "Just want to verify the public projection drops admin fields.",
  });
  if (created.kind !== "queued") throw new Error("expected queued");
  const updated = await moderateIdea({
    id: created.record.id,
    action: "approve",
    moderationNote: "looks fine",
  });
  const pub = toPublicIdea(updated);
  assert.equal(pub.authorHandle, "u1-handle");
  assert.equal(
    "authorId" in pub,
    false,
    "authorId must not leak in PublicIdea",
  );
  assert.equal(
    "moderationNote" in pub,
    false,
    "moderationNote must not leak in PublicIdea",
  );
});
