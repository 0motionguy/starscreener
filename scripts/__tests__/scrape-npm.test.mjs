import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeDownloadStats,
  encodePackageName,
  extractGithubRepoFullName,
  normalizeRepositoryUrl,
  parsePackageList,
} from "../scrape-npm.mjs";

test("parsePackageList dedupes comma/newline package lists", () => {
  assert.deepEqual(
    parsePackageList("openai, @anthropic-ai/sdk\nOpenAI\n\nzod"),
    ["openai", "@anthropic-ai/sdk", "zod"],
  );
});

test("encodePackageName URL-encodes scoped package slashes", () => {
  assert.equal(encodePackageName("openai"), "openai");
  assert.equal(encodePackageName("@trendingrepo/cli"), "%40trendingrepo%2Fcli");
});

test("normalizeRepositoryUrl handles common npm repository URL forms", () => {
  assert.equal(
    normalizeRepositoryUrl({ url: "git+https://github.com/openai/openai-node.git" }),
    "https://github.com/openai/openai-node",
  );
  assert.equal(
    normalizeRepositoryUrl("git@github.com:modelcontextprotocol/typescript-sdk.git"),
    "https://github.com/modelcontextprotocol/typescript-sdk",
  );
});

test("extractGithubRepoFullName extracts owner/name from normalized URLs", () => {
  assert.equal(
    extractGithubRepoFullName("https://github.com/anthropics/anthropic-sdk-typescript"),
    "anthropics/anthropic-sdk-typescript",
  );
  assert.equal(extractGithubRepoFullName("https://example.com/nope"), null);
});

test("computeDownloadStats calculates 7d, previous 7d, delta, and 30d", () => {
  const downloads = Array.from({ length: 30 }, (_, i) => ({
    day: `2026-04-${String(i + 1).padStart(2, "0")}`,
    downloads: i + 1,
  }));
  const stats = computeDownloadStats(downloads);

  assert.equal(stats.downloadsLastDay, 30);
  assert.equal(stats.downloads7d, 27 + 28 + 29 + 30 + 24 + 25 + 26);
  assert.equal(stats.previous7d, 17 + 18 + 19 + 20 + 21 + 22 + 23);
  assert.equal(stats.downloads30d, 465);
  assert.equal(stats.delta7d, 49);
  assert.ok(stats.deltaPct7d > 0);
  assert.ok(stats.trendScore > 0);
});
