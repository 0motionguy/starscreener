import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTwitterQueryBundle } from "../query-bundle";
import type { TwitterRepoInput } from "../types";

function makeRepo(overrides: Partial<TwitterRepoInput> = {}): TwitterRepoInput {
  return {
    repoId: "anthropic--claude-code",
    githubFullName: "anthropic/claude-code",
    githubUrl: "https://github.com/anthropic/claude-code",
    repoName: "claude-code",
    ownerName: "anthropic",
    homepageUrl: "https://claude.ai/code",
    docsUrl: "https://docs.anthropic.com/claude-code",
    packageNames: ["@anthropic-ai/claude-code"],
    aliases: ["Claude Code"],
    description: "Agentic coding CLI",
    ...overrides,
  };
}

test("buildTwitterQueryBundle emits exact tier-1 repo identifiers first", () => {
  const queries = buildTwitterQueryBundle(makeRepo());

  assert.equal(queries[0].queryType, "repo_slug");
  assert.equal(queries[0].queryText, "anthropic/claude-code");
  assert.ok(
    queries.some(
      (query) =>
        query.queryType === "repo_url" &&
        query.queryText === "https://github.com/anthropic/claude-code",
    ),
  );
  assert.ok(
    queries.some(
      (query) =>
        query.queryType === "project_name" &&
        query.queryText === "\"Claude Code\"",
    ),
  );
});

test("buildTwitterQueryBundle disables generic tier-3 fallback aliases", () => {
  const queries = buildTwitterQueryBundle(
    makeRepo({
      repoId: "acme--app",
      githubFullName: "acme/app",
      githubUrl: "https://github.com/acme/app",
      repoName: "app",
      aliases: ["app", "tool"],
      packageNames: [],
      homepageUrl: null,
      docsUrl: null,
    }),
  );

  const aliasQueries = queries.filter((query) => query.queryType === "alias");
  assert.ok(aliasQueries.length >= 1);
  assert.ok(aliasQueries.every((query) => query.enabled === false));
});
