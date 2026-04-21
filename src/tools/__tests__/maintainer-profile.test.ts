// StarScreener — maintainer_profile agent-tool tests.

import { beforeEach, test } from "node:test";
import { strict as assert } from "node:assert";

import { maintainerProfile } from "../maintainer-profile";
import { NotFoundError, ParamError } from "../errors";
import { clearRepoStore, makeRepo, seedRepos } from "./fixtures";

beforeEach(() => {
  clearRepoStore();
});

test("maintainer_profile aggregates owned repos", () => {
  seedRepos([
    makeRepo({
      id: "anthropics--claude-code",
      fullName: "anthropics/claude-code",
      owner: "anthropics",
      language: "TypeScript",
      stars: 5000,
      starsDelta7d: 200,
      momentumScore: 90,
      categoryId: "agents",
    }),
    makeRepo({
      id: "anthropics--anthropic-sdk-python",
      fullName: "anthropics/anthropic-sdk-python",
      owner: "anthropics",
      language: "Python",
      stars: 3000,
      starsDelta7d: 50,
      momentumScore: 70,
      categoryId: "sdk",
    }),
    makeRepo({
      id: "anthropics--prompt-eng",
      fullName: "anthropics/prompt-eng",
      owner: "anthropics",
      language: "Python",
      stars: 500,
      starsDelta7d: 5,
      momentumScore: 40,
      categoryId: "sdk",
    }),
    // Unrelated repo that must NOT be included.
    makeRepo({
      id: "openai--codex",
      fullName: "openai/codex",
      owner: "openai",
      language: "TypeScript",
    }),
  ]);

  const out = maintainerProfile({ handle: "anthropics" });

  assert.equal(out.handle, "anthropics");
  assert.equal(out.repo_count, 3);
  assert.equal(out.total_stars, 8500);
  assert.equal(out.total_stars_delta_7d, 255);

  // Python has 2 repos, TypeScript 1 → Python first.
  assert.deepEqual(out.languages, ["Python", "TypeScript"]);
  // sdk has 2, agents 1.
  assert.deepEqual(out.category_ids, ["sdk", "agents"]);

  // top_repos sorted by momentum desc, capped at 5.
  assert.equal(out.top_repos.length, 3);
  assert.deepEqual(
    out.top_repos.map((r) => r.full_name),
    [
      "anthropics/claude-code",
      "anthropics/anthropic-sdk-python",
      "anthropics/prompt-eng",
    ],
  );

  assert.ok(out.scope_note.includes("TrendingRepo index"));
});

test("maintainer_profile is case-insensitive on owner match", () => {
  seedRepos([
    makeRepo({
      id: "All-Hands-AI--OpenHands",
      fullName: "All-Hands-AI/OpenHands",
      owner: "All-Hands-AI",
      stars: 100,
    }),
  ]);

  const out = maintainerProfile({ handle: "all-hands-ai" });
  assert.equal(out.repo_count, 1);
  assert.equal(out.handle, "all-hands-ai");
});

test("maintainer_profile throws NotFoundError when no owned repos", () => {
  seedRepos([
    makeRepo({ id: "a--b", owner: "a" }),
  ]);
  assert.throws(
    () => maintainerProfile({ handle: "ghost" }),
    NotFoundError,
  );
});

test("maintainer_profile caps top_repos at 5", () => {
  seedRepos(
    Array.from({ length: 8 }, (_, i) =>
      makeRepo({
        id: `acme--r${i}`,
        fullName: `acme/r${i}`,
        owner: "acme",
        momentumScore: 100 - i,
      }),
    ),
  );
  const out = maintainerProfile({ handle: "acme" });
  assert.equal(out.repo_count, 8);
  assert.equal(out.top_repos.length, 5);
  assert.equal(out.top_repos[0].full_name, "acme/r0");
});

test("maintainer_profile ignores deleted repos", () => {
  seedRepos([
    makeRepo({ id: "acme--live", owner: "acme", stars: 100 }),
    makeRepo({ id: "acme--dead", owner: "acme", stars: 999, deleted: true }),
  ]);

  const out = maintainerProfile({ handle: "acme" });
  assert.equal(out.repo_count, 1);
  assert.equal(out.total_stars, 100);
});

test("maintainer_profile rejects invalid handle shapes", () => {
  assert.throws(() => maintainerProfile({}), ParamError);
  assert.throws(() => maintainerProfile({ handle: "" }), ParamError);
  assert.throws(() => maintainerProfile({ handle: "-bad" }), ParamError);
  assert.throws(() => maintainerProfile({ handle: "bad-" }), ParamError);
  assert.throws(
    () => maintainerProfile({ handle: "has spaces" }),
    ParamError,
  );
  assert.throws(
    () => maintainerProfile({ handle: "a".repeat(40) }),
    ParamError,
  );
  assert.throws(() => maintainerProfile(null), ParamError);
});
