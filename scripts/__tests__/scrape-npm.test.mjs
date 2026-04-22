import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeDownloadStats,
  encodePackageName,
  extractGithubRepoFullName,
  normalizeRangePayload,
  normalizeRepositoryUrl,
  normalizeSearchObject,
  parseDiscoveryQueries,
  resolveDownloadRange,
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
  const downloads = Array.from({ length: 60 }, (_, i) => ({
    day: `2026-04-${String(i + 1).padStart(2, "0")}`,
    downloads: i + 1,
  }));
  const stats = computeDownloadStats(downloads);

  assert.equal(stats.downloads24h, 60);
  assert.equal(stats.previous24h, 59);
  assert.equal(stats.delta24h, 1);
  assert.equal(stats.downloads7d, 54 + 55 + 56 + 57 + 58 + 59 + 60);
  assert.equal(stats.previous7d, 47 + 48 + 49 + 50 + 51 + 52 + 53);
  assert.equal(stats.downloads30d, 1365);
  assert.equal(stats.previous30d, 465);
  assert.equal(stats.delta30d, 900);
  assert.equal(stats.delta7d, 49);
  assert.ok(stats.deltaPct7d > 0);
  assert.ok(stats.deltaPct30d > 0);
  assert.ok(stats.trendScore24h > 0);
  assert.ok(stats.trendScore7d > stats.trendScore24h);
  assert.ok(stats.trendScore30d > stats.trendScore7d);
});

test("normalizeRangePayload keeps sorted daily download rows", () => {
  assert.deepEqual(
    normalizeRangePayload({
      downloads: [
        { day: "2026-04-02", downloads: 20 },
        { day: "nope", downloads: 99 },
        { day: "2026-04-01", downloads: -1 },
      ],
    }),
    [
      { day: "2026-04-01", downloads: 0 },
      { day: "2026-04-02", downloads: 20 },
    ],
  );
});

test("resolveDownloadRange defaults to a lagged UTC end date and requested trailing days", () => {
  assert.deepEqual(
    resolveDownloadRange({
      days: 60,
      now: new Date("2026-04-22T10:00:00.000Z"),
    }),
    {
      start: "2026-02-20",
      end: "2026-04-20",
      days: 60,
    },
  );

  assert.deepEqual(
    resolveDownloadRange({
      days: 14,
      endDate: "2026-04-20",
    }),
    {
      start: "2026-04-07",
      end: "2026-04-20",
      days: 14,
    },
  );
});

test("computeDownloadStats sorts daily rows before computing windows", () => {
  const stats = computeDownloadStats([
    { day: "2026-04-02", downloads: 20 },
    { day: "2026-04-01", downloads: 10 },
    { day: "2026-04-03", downloads: 30 },
  ]);

  assert.equal(stats.downloads24h, 30);
  assert.equal(stats.previous24h, 20);
  assert.equal(stats.delta24h, 10);
  assert.equal(stats.downloads7d, 60);
});

test("sortByWindow uses movement tie-breakers after score", () => {
  const rows = [
    {
      name: "a",
      trendScore24h: 10,
      trendScore7d: 100,
      trendScore30d: 300,
      deltaPct24h: 10,
      delta24h: 1,
    },
    {
      name: "b",
      trendScore24h: 10,
      trendScore7d: 80,
      trendScore30d: 100,
      deltaPct24h: 20,
      delta24h: 1,
    },
  ];

  assert.deepEqual(sortByWindow(rows, "24h").map((row) => row.name), ["b", "a"]);
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
