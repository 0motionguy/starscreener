// StarScreener — search_repos agent-tool tests.

import { beforeEach, test } from "node:test";
import { strict as assert } from "node:assert";

import { searchRepos } from "../search-repos";
import { ParamError } from "../errors";
import { clearRepoStore, makeRepo, seedRepos } from "./fixtures";

beforeEach(() => {
  clearRepoStore();
});

test("search_repos matches substring on fullName, description, topics", () => {
  seedRepos([
    makeRepo({
      id: "anthropics--claude-code",
      description: "Anthropic's official CLI for Claude",
      topics: ["agent"],
      momentumScore: 90,
    }),
    makeRepo({
      id: "openai--codex",
      description: "Coding agent",
      topics: ["code", "agent"],
      momentumScore: 70,
    }),
    makeRepo({
      id: "other--web",
      description: "A web framework",
      topics: ["web"],
      momentumScore: 60,
    }),
  ]);

  const byName = searchRepos({ query: "claude" });
  assert.equal(byName.count, 1);
  assert.equal(byName.repos[0].full_name, "anthropics/claude-code");

  const byTopic = searchRepos({ query: "agent" });
  assert.equal(byTopic.count, 2);
  // Sorted by momentum desc: claude-code (90) first, codex (70) second
  assert.equal(byTopic.repos[0].full_name, "anthropics/claude-code");
  assert.equal(byTopic.repos[1].full_name, "openai/codex");
});

test("search_repos is case-insensitive", () => {
  seedRepos([
    makeRepo({
      id: "vercel--next.js",
      description: "The React Framework",
    }),
  ]);
  const out = searchRepos({ query: "NEXT" });
  assert.equal(out.count, 1);
});

test("search_repos respects limit, clamped to 50", () => {
  seedRepos(
    Array.from({ length: 60 }, (_, i) =>
      makeRepo({
        id: `owner--match${i}`,
        fullName: `owner/match${i}`,
        description: "agent coding tool",
        momentumScore: 60 - i,
      }),
    ),
  );

  assert.equal(searchRepos({ query: "agent", limit: 3 }).count, 3);
  assert.equal(searchRepos({ query: "agent", limit: 9999 }).count, 50);
});

test("search_repos returns empty when no match", () => {
  seedRepos([makeRepo({ id: "a--b", description: "nothing relevant" })]);
  const out = searchRepos({ query: "nonexistent" });
  assert.equal(out.count, 0);
  assert.deepEqual(out.repos, []);
});

test("search_repos rejects invalid params", () => {
  assert.throws(() => searchRepos(null), ParamError);
  assert.throws(() => searchRepos({}), ParamError);
  assert.throws(() => searchRepos({ query: "" }), ParamError);
  assert.throws(() => searchRepos({ query: "   " }), ParamError);
  assert.throws(() => searchRepos({ query: "x", limit: -1 }), ParamError);
});
