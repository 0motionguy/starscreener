import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractAllRepoMentions,
  extractFirstGithubRepoLink,
  extractGithubRepoFullNames,
  extractTrackedBareRefs,
  extractUnknownRepoCandidates,
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

test("extractTrackedBareRefs: matches bare owner/repo tokens in tracked set", () => {
  const tracked = new Set(["openai/whisper", "vercel/next.js"]);
  const hits = extractTrackedBareRefs(
    "excited about openai/whisper today, also vercel/next.js fans",
    tracked,
  );
  assert.deepEqual([...hits].sort(), ["openai/whisper", "vercel/next.js"]);
});

test("extractTrackedBareRefs: drops bare tokens that aren't tracked", () => {
  const tracked = new Set(["openai/whisper"]);
  const hits = extractTrackedBareRefs(
    "openai/whisper and some/other-repo",
    tracked,
  );
  assert.deepEqual([...hits], ["openai/whisper"]);
});

test("extractTrackedBareRefs: returns empty when tracked set is empty/null", () => {
  assert.equal(extractTrackedBareRefs("openai/whisper", new Set()).size, 0);
  assert.equal(extractTrackedBareRefs("openai/whisper", null).size, 0);
});

test("extractTrackedBareRefs: does not match owner/repo embedded in github.com URL", () => {
  const tracked = new Set(["openai/whisper"]);
  const hits = extractTrackedBareRefs(
    "https://github.com/openai/whisper/blob/main",
    tracked,
  );
  // The owner/repo here is followed by /blob/, so the lookahead rejects
  // the match. The github.com path extractor is the right tool for this
  // shape; the bare extractor stays out of its lane.
  assert.equal(hits.size, 0);
});

test("extractTrackedBareRefs: does not match filesystem-path fragments", () => {
  const tracked = new Set(["src/lib"]);
  const hits = extractTrackedBareRefs(
    "see src/lib/utils.ts for the helper",
    tracked,
  );
  // src/lib is followed by /utils.ts, lookahead rejects.
  assert.equal(hits.size, 0);
});

test("extractTrackedBareRefs: handles adjacent matches separated by punctuation", () => {
  const tracked = new Set(["foo/bar", "baz/qux"]);
  const hits = extractTrackedBareRefs("compare foo/bar,baz/qux quickly", tracked);
  assert.deepEqual([...hits].sort(), ["baz/qux", "foo/bar"]);
});

test("extractAllRepoMentions: unions URL form + bare form when tracked supplied", () => {
  const tracked = new Set(["openai/whisper", "vercel/next.js"]);
  const hits = extractAllRepoMentions(
    "github.com/vercel/next.js plus a bare openai/whisper today",
    tracked,
  );
  assert.deepEqual([...hits].sort(), ["openai/whisper", "vercel/next.js"]);
});

test("extractAllRepoMentions: with null tracked returns only URL form (bare needs tracked)", () => {
  const hits = extractAllRepoMentions(
    "github.com/openai/gym and a bare some/repo nobody tracks",
    null,
  );
  assert.deepEqual([...hits], ["openai/gym"]);
});

test("extractUnknownRepoCandidates: returns github URLs not in tracked set", () => {
  const tracked = new Set(["openai/whisper"]);
  const hits = extractUnknownRepoCandidates(
    "github.com/openai/whisper and github.com/random/uncovered",
    tracked,
  );
  assert.deepEqual([...hits], ["random/uncovered"]);
});

test("extractUnknownRepoCandidates: with null tracked returns ALL github URLs", () => {
  const hits = extractUnknownRepoCandidates(
    "github.com/anthropics/claude-code and github.com/openai/gym",
    null,
  );
  assert.deepEqual([...hits].sort(), ["anthropics/claude-code", "openai/gym"]);
});

test("extractUnknownRepoCandidates: skips reserved github paths", () => {
  const hits = extractUnknownRepoCandidates(
    "https://github.com/orgs/foo and https://github.com/settings/profile",
    null,
  );
  assert.equal(hits.size, 0);
});

test("extractUnknownRepoCandidates: URL form only — does NOT match bare owner/repo tokens", () => {
  // Bare-form has too many false positives without a tracked-set anchor;
  // the unknown lake is for github.com URLs only by design.
  const hits = extractUnknownRepoCandidates("excited about openai/whisper today", null);
  assert.equal(hits.size, 0);
});
