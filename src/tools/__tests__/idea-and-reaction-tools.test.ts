// Portal tool tests for the six new entities:
//   - list_ideas, get_idea, top_reactions, predict_repo (read)
//   - submit_idea, react_to (write, auth-gated)
//
// Uses the same isolated-temp-dir pattern as the underlying
// src/lib/__tests__ suite so nothing touches the real .data dir.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_DIR = mkdtempSync(join(tmpdir(), "starscreener-tool-ideas-"));
process.env.STARSCREENER_DATA_DIR = TMP_DIR;
// Silence the idea-published hook during test setup.
(process.env as Record<string, string>).TWITTER_OUTBOUND_MODE = "null";

import { IDEAS_FILE, createIdea, moderateIdea } from "../../lib/ideas";
import { REACTIONS_FILE, toggleReaction } from "../../lib/reactions";
import { OUTBOUND_RUNS_FILE } from "../../lib/twitter/outbound/audit";
import { writeJsonlFile } from "../../lib/pipeline/storage/file-persistence";
import { __awaitInFlightAutoPosts } from "../../lib/twitter/outbound/idea-publisher";
import { listIdeasTool } from "../list-ideas";
import { getIdeaTool } from "../get-idea";
import { topReactionsTool } from "../top-reactions";
import { submitIdeaTool } from "../submit-idea";
import { reactToTool } from "../react-to";
import { AuthError, NotFoundError, ParamError } from "../errors";

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
// list_ideas
// ---------------------------------------------------------------------------

test("list_ideas returns only published/shipped ideas, sorted hot by default", async () => {
  const pending = await createIdea({
    authorId: "a",
    authorHandle: "a",
    title: "Pending idea",
    pitch: "A pitch long enough to satisfy the composer minimum length.",
  });
  const publishedRaw = await createIdea({
    authorId: "b",
    authorHandle: "b",
    title: "Published idea",
    pitch: "Another pitch long enough to pass the composer validation.",
  });
  if (pending.kind !== "queued" || publishedRaw.kind !== "queued") {
    throw new Error("expected queued");
  }
  await moderateIdea({ id: publishedRaw.record.id, action: "approve" });
  await __awaitInFlightAutoPosts();

  const result = await listIdeasTool({});
  assert.equal(result.sort, "hot");
  assert.equal(result.ideas.length, 1);
  assert.equal(result.ideas[0]?.title, "Published idea");
  assert.ok(typeof result.ideas[0]?.hot_score === "number");
  // reaction_counts present on every item.
  assert.deepEqual(result.ideas[0]?.reaction_counts, {
    build: 0,
    use: 0,
    buy: 0,
    invest: 0,
  });
});

test("list_ideas sort='new' is chronological desc", async () => {
  const first = await createIdea({
    authorId: "a",
    authorHandle: "a",
    title: "First idea posted",
    pitch: "First pitch long enough to satisfy the composer minimum length.",
  });
  const second = await createIdea({
    authorId: "b",
    authorHandle: "b",
    title: "Second idea posted",
    pitch: "Second pitch long enough to satisfy the composer minimum length.",
  });
  if (first.kind !== "queued" || second.kind !== "queued") {
    throw new Error("expected queued");
  }
  await moderateIdea({ id: first.record.id, action: "approve" });
  await new Promise((r) => setTimeout(r, 10));
  await moderateIdea({ id: second.record.id, action: "approve" });
  await __awaitInFlightAutoPosts();

  const result = await listIdeasTool({ sort: "new" });
  assert.equal(result.ideas[0]?.title, "Second idea posted");
});

test("list_ideas rejects invalid sort", async () => {
  await assert.rejects(
    () => listIdeasTool({ sort: "trending" }),
    ParamError,
  );
});

// ---------------------------------------------------------------------------
// get_idea
// ---------------------------------------------------------------------------

test("get_idea returns a published idea with its reaction counts", async () => {
  const created = await createIdea({
    authorId: "c",
    authorHandle: "c",
    title: "Get-me idea",
    pitch: "A pitch long enough to satisfy the composer minimum length.",
  });
  if (created.kind !== "queued") throw new Error("expected queued");
  await moderateIdea({ id: created.record.id, action: "approve" });
  await __awaitInFlightAutoPosts();
  await toggleReaction({
    userId: "reactor",
    objectType: "idea",
    objectId: created.record.id,
    reactionType: "build",
  });

  const result = await getIdeaTool({ id: created.record.id });
  assert.equal(result.idea.title, "Get-me idea");
  assert.equal(result.reaction_counts.build, 1);
});

test("get_idea 404s pending/rejected ideas", async () => {
  const pending = await createIdea({
    authorId: "d",
    authorHandle: "d",
    title: "Still pending",
    pitch: "A pitch long enough to satisfy the composer minimum length.",
  });
  if (pending.kind !== "queued") throw new Error("expected queued");
  await assert.rejects(
    () => getIdeaTool({ id: pending.record.id }),
    NotFoundError,
  );
});

test("get_idea rejects missing id", async () => {
  await assert.rejects(() => getIdeaTool({}), ParamError);
});

// ---------------------------------------------------------------------------
// top_reactions
// ---------------------------------------------------------------------------

test("top_reactions ranks repos by reaction volume", async () => {
  await toggleReaction({
    userId: "u1",
    objectType: "repo",
    objectId: "hot/repo",
    reactionType: "build",
  });
  await toggleReaction({
    userId: "u2",
    objectType: "repo",
    objectId: "hot/repo",
    reactionType: "use",
  });
  await toggleReaction({
    userId: "u1",
    objectType: "repo",
    objectId: "cold/repo",
    reactionType: "build",
  });

  const result = await topReactionsTool({});
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.object_id, "hot/repo");
  assert.equal(result.items[0]?.total, 2);
});

test("top_reactions type='buy' ranks by the 'buy' column only", async () => {
  await toggleReaction({
    userId: "u1",
    objectType: "repo",
    objectId: "buyer/repo",
    reactionType: "buy",
  });
  await toggleReaction({
    userId: "u2",
    objectType: "repo",
    objectId: "builder/repo",
    reactionType: "build",
  });
  await toggleReaction({
    userId: "u3",
    objectType: "repo",
    objectId: "builder/repo",
    reactionType: "build",
  });

  const result = await topReactionsTool({ type: "buy" });
  // 'builder/repo' has 2 builds but 0 buys → drops out.
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.object_id, "buyer/repo");
});

test("top_reactions objectType='idea' filters out repo reactions", async () => {
  await toggleReaction({
    userId: "u1",
    objectType: "repo",
    objectId: "some/repo",
    reactionType: "build",
  });
  await toggleReaction({
    userId: "u1",
    objectType: "idea",
    objectId: "someideaid",
    reactionType: "build",
  });
  const result = await topReactionsTool({ objectType: "idea" });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.object_type, "idea");
});

// ---------------------------------------------------------------------------
// submit_idea (write, auth-gated)
// ---------------------------------------------------------------------------

test("submit_idea without a principal throws AuthError", async () => {
  await assert.rejects(
    () =>
      submitIdeaTool({
        title: "Needs auth",
        pitch: "A pitch long enough to satisfy the composer minimum length.",
      }),
    AuthError,
  );
});

test("submit_idea with a principal queues the first idea from that agent", async () => {
  const result = await submitIdeaTool(
    {
      title: "Agent's first idea",
      pitch: "A pitch long enough to satisfy the composer minimum length.",
    },
    { principal: "claude" },
  );
  assert.equal(result.kind, "queued");
  assert.equal(result.idea.authorHandle, "claude");
});

test("submit_idea returns duplicate when the same principal reposts the same title", async () => {
  const first = await submitIdeaTool(
    {
      title: "Common title",
      pitch: "First pitch that clears the composer's length validation.",
    },
    { principal: "claude" },
  );
  assert.equal(first.kind, "queued");
  const second = await submitIdeaTool(
    {
      title: "Common title",
      pitch: "Second pitch with different wording but same title collision.",
    },
    { principal: "claude" },
  );
  assert.equal(second.kind, "duplicate");
});

test("submit_idea surfaces validation errors as ParamError", async () => {
  await assert.rejects(
    () =>
      submitIdeaTool(
        { title: "x", pitch: "too short" },
        { principal: "claude" },
      ),
    ParamError,
  );
});

// ---------------------------------------------------------------------------
// react_to (write, auth-gated)
// ---------------------------------------------------------------------------

test("react_to without a principal throws AuthError", async () => {
  await assert.rejects(
    () =>
      reactToTool({
        objectType: "repo",
        objectId: "vercel/next.js",
        reactionType: "build",
      }),
    AuthError,
  );
});

test("react_to toggles on then off with the same principal", async () => {
  const first = await reactToTool(
    {
      objectType: "repo",
      objectId: "vercel/next.js",
      reactionType: "build",
    },
    { principal: "claude" },
  );
  assert.equal(first.toggled, "added");
  assert.equal(first.counts.build, 1);
  assert.equal(first.mine.build, true);

  const second = await reactToTool(
    {
      objectType: "repo",
      objectId: "vercel/next.js",
      reactionType: "build",
    },
    { principal: "claude" },
  );
  assert.equal(second.toggled, "removed");
  assert.equal(second.counts.build, 0);
  assert.equal(second.mine.build, false);
});

test("react_to rejects unknown reactionType", async () => {
  await assert.rejects(
    () =>
      reactToTool(
        {
          objectType: "repo",
          objectId: "vercel/next.js",
          reactionType: "share",
        },
        { principal: "claude" },
      ),
    ParamError,
  );
});

test("react_to rejects unknown objectType", async () => {
  await assert.rejects(
    () =>
      reactToTool(
        {
          objectType: "comment",
          objectId: "anything",
          reactionType: "build",
        },
        { principal: "claude" },
      ),
    ParamError,
  );
});
