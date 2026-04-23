import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractFirstGithubRepoLink,
  extractGithubRepoFullNames,
  githubFullNameToUrl,
  normalizeGithubFullName,
  normalizeGithubRepoUrl,
} from "../_github-repo-links.mjs";

test("normalizeGithubFullName: lowercases and strips .git plus punctuation to fixed point", () => {
  assert.equal(normalizeGithubFullName("OpenAI", "Gym"), "openai/gym");
  assert.equal(normalizeGithubFullName("foo", "bar.git"), "foo/bar");
  assert.equal(normalizeGithubFullName("foo", "bar.git."), "foo/bar");
  assert.equal(normalizeGithubFullName("foo", "bar.git)."), "foo/bar");
  assert.equal(normalizeGithubFullName("a", "b,"), "a/b");
});

test("extractGithubRepoFullNames: parses bare and protocol github repo links", () => {
  const hits = extractGithubRepoFullNames(
    "github.com/anthropics/claude-code and https://www.github.com/openai/gym",
  );
  assert.deepEqual([...hits], ["anthropics/claude-code", "openai/gym"]);
});

test("extractGithubRepoFullNames: rejects reserved paths and non-github hosts", () => {
  const hits = extractGithubRepoFullNames(
    "https://github.com/orgs/foo https://github.com/settings/profile https://api.github.com/repos/foo/bar",
  );
  assert.equal(hits.size, 0);
});

test("extractGithubRepoFullNames: filters against tracked full names", () => {
  const hits = extractGithubRepoFullNames(
    "github.com/foo/bar github.com/baz/qux",
    new Set(["foo/bar"]),
  );
  assert.deepEqual([...hits], ["foo/bar"]);
});

test("extractFirstGithubRepoLink: returns canonical url and full name", () => {
  assert.deepEqual(extractFirstGithubRepoLink("clone https://github.com/Foo/Bar.git."), {
    fullName: "foo/bar",
    url: "https://github.com/foo/bar",
  });
  assert.equal(extractFirstGithubRepoLink("no repo here"), null);
});

test("normalizeGithubRepoUrl: canonicalizes URL path variants", () => {
  assert.equal(
    normalizeGithubRepoUrl("https://github.com/openai/gym/tree/main"),
    "https://github.com/openai/gym",
  );
  assert.equal(
    normalizeGithubRepoUrl("https://github.com/foo/bar.git/tree/main"),
    "https://github.com/foo/bar",
  );
  assert.equal(normalizeGithubRepoUrl("https://github.com/trending/rust"), null);
});

test("githubFullNameToUrl: rejects invalid full names", () => {
  assert.equal(githubFullNameToUrl("openai/gym"), "https://github.com/openai/gym");
  assert.equal(githubFullNameToUrl("openai"), null);
  assert.equal(githubFullNameToUrl("openai/gym/tree/main"), null);
});
