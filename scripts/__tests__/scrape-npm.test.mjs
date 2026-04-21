import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeDownloadStats,
  computePointStats,
  encodePackageName,
  extractGithubRepoFullName,
  normalizeRepositoryUrl,
  normalizeSearchObject,
  parseDiscoveryQueries,
  sortByWindow,
} from "../scrape-npm.mjs";

test("parseDiscoveryQueries dedupes comma/newline query lists", () => {
  assert.deepEqual(
    parseDiscoveryQueries("ai, llm\nAI\n\nmcp"),
    ["ai", "llm", "mcp"],
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

test("normalizeSearchObject returns only packages with GitHub repos", () => {
  const object = {
    searchScore: 12,
    score: { final: 34 },
    package: {
      name: "@modelcontextprotocol/sdk",
      version: "1.2.3",
      description: "MCP SDK",
      date: "2026-04-20T00:00:00.000Z",
      keywords: ["mcp", "sdk"],
      links: {
        npm: "https://www.npmjs.com/package/@modelcontextprotocol/sdk",
        repository: "git+https://github.com/modelcontextprotocol/typescript-sdk.git",
      },
    },
  };

  const normalized = normalizeSearchObject(object, "mcp");
  assert.equal(normalized.name, "@modelcontextprotocol/sdk");
  assert.equal(normalized.linkedRepo, "modelcontextprotocol/typescript-sdk");
  assert.deepEqual(normalized.discovery.queries, ["mcp"]);
  assert.equal(normalizeSearchObject({ package: { name: "x", links: {} } }, "x"), null);
});

test("computeDownloadStats calculates 24h, 7d, previous windows, and 30d", () => {
  const downloads = Array.from({ length: 30 }, (_, i) => ({
    day: `2026-04-${String(i + 1).padStart(2, "0")}`,
    downloads: i + 1,
  }));
  const stats = computeDownloadStats(downloads);

  assert.equal(stats.downloads24h, 30);
  assert.equal(stats.previous24h, 29);
  assert.equal(stats.delta24h, 1);
  assert.equal(stats.downloads7d, 24 + 25 + 26 + 27 + 28 + 29 + 30);
  assert.equal(stats.previous7d, 17 + 18 + 19 + 20 + 21 + 22 + 23);
  assert.equal(stats.downloads30d, 465);
  assert.equal(stats.delta7d, 49);
  assert.ok(stats.deltaPct7d > 0);
  assert.ok(stats.trendScore24h > 0);
  assert.ok(stats.trendScore7d > stats.trendScore24h);
});

test("computePointStats maps bulk npm point values to all windows", () => {
  const stats = computePointStats({
    downloads24h: 10,
    downloads7d: 70,
    downloads30d: 300,
  });

  assert.equal(stats.downloads24h, 10);
  assert.equal(stats.downloads7d, 70);
  assert.equal(stats.downloads30d, 300);
  assert.equal(stats.trendScore24h, 10);
  assert.equal(stats.trendScore7d, 70);
  assert.equal(stats.trendScore30d, 300);
});

test("sortByWindow sorts by the requested window score", () => {
  const rows = [
    { name: "a", trendScore24h: 10, trendScore7d: 100, trendScore30d: 300 },
    { name: "b", trendScore24h: 50, trendScore7d: 80, trendScore30d: 100 },
  ];

  assert.deepEqual(sortByWindow(rows, "24h").map((row) => row.name), ["b", "a"]);
  assert.deepEqual(sortByWindow(rows, "7d").map((row) => row.name), ["a", "b"]);
  assert.deepEqual(sortByWindow(rows, "30d").map((row) => row.name), ["a", "b"]);
});
