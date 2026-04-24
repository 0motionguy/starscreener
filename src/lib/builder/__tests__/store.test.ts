// TrendingRepo — JsonBuilderStore tests.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { JsonBuilderStore } from "../store";
import type { Idea, Reaction } from "../types";
import { ideaIdFromSlug } from "../ids";

async function mkTmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "tr-builder-store-"));
}

test("JsonBuilderStore: upsertBuilder + getBuilder round-trips", async () => {
  const dir = await mkTmp();
  const store = new JsonBuilderStore(dir);
  await store.upsertBuilder({
    id: "b1",
    handle: "builder-abc123",
    depthScore: 0.5,
    createdAt: "2026-04-24T00:00:00.000Z",
    lastActiveAt: "2026-04-24T00:00:00.000Z",
  });
  const b = await store.getBuilder("b1");
  assert.ok(b);
  assert.equal(b.id, "b1");
  assert.equal(b.handle, "builder-abc123");
});

test("JsonBuilderStore: createIdea + getIdea by id and by slug", async () => {
  const dir = await mkTmp();
  const store = new JsonBuilderStore(dir);

  await store.upsertBuilder({
    id: "b1",
    handle: "b",
    depthScore: 0.5,
    createdAt: "2026-04-24T00:00:00.000Z",
    lastActiveAt: "2026-04-24T00:00:00.000Z",
  });

  const idea: Idea = {
    id: ideaIdFromSlug("the-slug"),
    slug: "the-slug",
    authorBuilderId: "b1",
    thesis: "A".repeat(160),
    problem: "B".repeat(160),
    whyNow: "C".repeat(160),
    linkedRepoIds: ["vercel/next.js"],
    stack: { models: [], apis: [], tools: [], skills: [] },
    tags: ["test"],
    phase: "seed",
    public: true,
    createdAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-24T00:00:00.000Z",
  };

  await store.createIdea(idea);

  const byId = await store.getIdea(idea.id);
  const bySlug = await store.getIdea("the-slug");
  assert.ok(byId);
  assert.ok(bySlug);
  assert.equal(byId.slug, "the-slug");
  assert.equal(bySlug.id, idea.id);
});

test("JsonBuilderStore: listIdeas respects 'new' sort + tag filter", async () => {
  const dir = await mkTmp();
  const store = new JsonBuilderStore(dir);

  await store.upsertBuilder({
    id: "b1",
    handle: "b",
    depthScore: 0.5,
    createdAt: "2026-04-24T00:00:00.000Z",
    lastActiveAt: "2026-04-24T00:00:00.000Z",
  });

  const mkIdea = (slug: string, tags: string[], createdAt: string): Idea => ({
    id: ideaIdFromSlug(slug),
    slug,
    authorBuilderId: "b1",
    thesis: "T".repeat(160),
    problem: "P".repeat(160),
    whyNow: "W".repeat(160),
    linkedRepoIds: ["x/y"],
    stack: { models: [], apis: [], tools: [], skills: [] },
    tags,
    phase: "seed",
    public: true,
    createdAt,
    updatedAt: createdAt,
  });

  await store.createIdea(mkIdea("older", ["a", "b"], "2026-04-20T00:00:00.000Z"));
  await store.createIdea(mkIdea("newer", ["b"], "2026-04-22T00:00:00.000Z"));
  await store.createIdea(mkIdea("newest", ["b", "c"], "2026-04-23T00:00:00.000Z"));

  const all = await store.listIdeas({ sort: "new", limit: 10, offset: 0 });
  assert.equal(all.length, 3);
  assert.equal(all[0].slug, "newest");
  assert.equal(all[2].slug, "older");

  const filtered = await store.listIdeas({
    sort: "new",
    limit: 10,
    offset: 0,
    tag: "c",
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].slug, "newest");
});

test("JsonBuilderStore: tally counts + unique builders + conviction density", async () => {
  const dir = await mkTmp();
  const store = new JsonBuilderStore(dir);

  const rx = (
    id: string,
    kind: Reaction["kind"],
    builderId: string,
  ): Reaction => ({
    id,
    kind,
    subjectType: "repo",
    subjectId: "vercel/next.js",
    builderId,
    payload: {},
    createdAt: new Date().toISOString(),
  });

  // Three builders: b1 (use+build), b2 (build), b3 (invest).
  await store.addReaction(rx("r1", "use", "b1"));
  await store.addReaction(rx("r2", "build", "b1"));
  await store.addReaction(rx("r3", "build", "b2"));
  await store.addReaction(rx("r4", "invest", "b3"));

  const tally = await store.getTally("repo", "vercel/next.js");
  assert.equal(tally.use, 1);
  assert.equal(tally.build, 2);
  assert.equal(tally.buy, 0);
  assert.equal(tally.invest, 1);
  assert.equal(tally.uniqueBuilders, 3);
  // (build + 2*invest) / uniqueBuilders = (2 + 2) / 3 ≈ 1.333
  assert.ok(Math.abs(tally.conviction - 4 / 3) < 1e-9);
});

test("JsonBuilderStore: removeReaction only works for the author", async () => {
  const dir = await mkTmp();
  const store = new JsonBuilderStore(dir);

  await store.addReaction({
    id: "r1",
    kind: "build",
    subjectType: "repo",
    subjectId: "x/y",
    builderId: "author",
    payload: { buildThesis: "demo" },
    createdAt: new Date().toISOString(),
  });

  const strangerFail = await store.removeReaction("r1", "stranger");
  assert.equal(strangerFail, false);

  const authorOk = await store.removeReaction("r1", "author");
  assert.equal(authorOk, true);

  const after = await store.getReactions("repo", "x/y");
  assert.equal(after.length, 0);
});
