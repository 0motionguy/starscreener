// TrendingRepo Pipeline — MCP domain scorer tests.

import { test } from "node:test";
import assert from "node:assert/strict";

import { mcpScorer, type McpItem } from "../scoring/domain/mcp";

function mk(overrides: Partial<McpItem> = {}): McpItem {
  return {
    domainKey: "mcp",
    id: "test-mcp",
    joinKeys: { npmName: "@org/test-mcp" },
    npmDownloads7d: 5000,
    pypiDownloads7d: 1000,
    livenessUptime7d: 0.99,
    livenessInferred: false,
    toolCount: 8,
    smitheryRank: 50,
    smitheryTotal: 1000,
    npmDependents: 30,
    crossSourceCount: 3,
    p50LatencyMs: 250,
    isStdio: false,
    ...overrides,
  };
}

function weightSum(w: Record<string, number>): number {
  return Object.values(w).reduce((a, b) => a + b, 0);
}

test("mcp happy path: score in [0,100], weights sum to 1.0", () => {
  const [s] = mcpScorer.computeRaw([mk()]);
  assert.ok(Number.isFinite(s.rawScore));
  assert.ok(s.rawScore >= 0 && s.rawScore <= 100);
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
  assert.equal(s.primaryMetric.name, "downloads_7d");
  assert.equal(s.primaryMetric.value, 6000);
});

test("mcp drops livenessUptime7d when isStdio=true", () => {
  const [s] = mcpScorer.computeRaw([mk({ isStdio: true })]);
  assert.equal(s.weights.livenessUptime7d, undefined);
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
});

test("mcp drops downloads when both npm and pypi missing, falls back to toolCount primary", () => {
  const [s] = mcpScorer.computeRaw([
    mk({ npmDownloads7d: undefined, pypiDownloads7d: undefined }),
  ]);
  assert.equal(s.weights.downloadsCombined7d, undefined);
  assert.equal(s.primaryMetric.name, "tool_count");
  assert.equal(s.primaryMetric.value, 8);
});

test("mcp returns '—' primary metric when downloads + toolCount both missing", () => {
  const [s] = mcpScorer.computeRaw([
    mk({
      npmDownloads7d: undefined,
      pypiDownloads7d: undefined,
      toolCount: undefined,
    }),
  ]);
  assert.equal(s.primaryMetric.label, "—");
  assert.equal(s.primaryMetric.value, 0);
});

test("mcp drops smitheryRankInverse when total=0", () => {
  const [s] = mcpScorer.computeRaw([mk({ smitheryTotal: 0 })]);
  assert.equal(s.weights.smitheryRankInverse, undefined);
});

test("mcp drops latencyInverse when undefined; high latency → low score", () => {
  const [withLatency] = mcpScorer.computeRaw([mk({ p50LatencyMs: 2000 })]);
  assert.equal(withLatency.rawComponents.latencyInverse, 0);

  const [missing] = mcpScorer.computeRaw([
    mk({ p50LatencyMs: undefined }),
  ]);
  assert.equal(missing.weights.latencyInverse, undefined);
});

test("mcp lastReleaseRecency: 10d ago outscores 200d ago; undefined drops term", () => {
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
  const twoHundredDaysAgo = new Date(
    Date.now() - 200 * 24 * 3600 * 1000,
  ).toISOString();
  const [fresh] = mcpScorer.computeRaw([mk({ lastReleaseAt: tenDaysAgo })]);
  const [stale] = mcpScorer.computeRaw([
    mk({ lastReleaseAt: twoHundredDaysAgo }),
  ]);
  assert.ok(
    fresh.rawComponents.lastReleaseRecency >
      stale.rawComponents.lastReleaseRecency,
    `fresh ${fresh.rawComponents.lastReleaseRecency} should beat stale ${stale.rawComponents.lastReleaseRecency}`,
  );
  assert.equal(fresh.rawComponents.lastReleaseRecency, 100);

  const [missing] = mcpScorer.computeRaw([mk({ lastReleaseAt: undefined })]);
  assert.equal(missing.weights.lastReleaseRecency, undefined);
  assert.equal(missing.rawComponents.lastReleaseRecency, undefined);
  assert.ok(Math.abs(weightSum(missing.weights) - 1) < 1e-9);
});

test("mcp weights total to 1.0 with all fields present", () => {
  const recent = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();
  const [s] = mcpScorer.computeRaw([mk({ lastReleaseAt: recent })]);
  const expectedKeys = [
    "downloadsCombined7d",
    "livenessUptime7d",
    "toolCount",
    "smitheryRankInverse",
    "npmDependents",
    "crossSourceCount",
    "latencyInverse",
    "lastReleaseRecency",
  ];
  for (const k of expectedKeys) {
    assert.ok(
      s.weights[k] !== undefined,
      `expected weight for ${k} to be defined`,
    );
  }
  assert.ok(Math.abs(weightSum(s.weights) - 1) < 1e-9);
});

test("mcp renormalization invariant: all optionals undefined → score in [0,100], weights sum to 1", () => {
  const [s] = mcpScorer.computeRaw([
    {
      domainKey: "mcp",
      id: "bare",
      joinKeys: {},
    },
  ]);
  assert.ok(s.rawScore >= 0 && s.rawScore <= 100, `score=${s.rawScore}`);
  assert.ok(
    Math.abs(weightSum(s.weights) - 1) < 1e-9,
    `weights=${JSON.stringify(s.weights)}`,
  );
});

test("mcp ranking: high downloads + uptime + tools beats stub", () => {
  const items: McpItem[] = [
    mk({
      id: "winner",
      npmDownloads7d: 80000,
      pypiDownloads7d: 30000,
      toolCount: 15,
      smitheryRank: 5,
      npmDependents: 200,
      crossSourceCount: 4,
    }),
    mk({
      id: "decent",
      npmDownloads7d: 1000,
      pypiDownloads7d: 0,
      toolCount: 4,
      smitheryRank: 500,
      npmDependents: 5,
    }),
    mk({
      id: "stub",
      npmDownloads7d: 10,
      pypiDownloads7d: 0,
      livenessUptime7d: 0.4,
      toolCount: 1,
      smitheryRank: 999,
      npmDependents: 0,
      crossSourceCount: 1,
      p50LatencyMs: 1900,
    }),
    mk({
      id: "stdio-no-uptime",
      isStdio: true,
      npmDownloads7d: 5000,
      toolCount: 6,
    }),
    mk({
      id: "missing-extras",
      npmDownloads7d: undefined,
      pypiDownloads7d: undefined,
      toolCount: 3,
      smitheryRank: undefined,
      smitheryTotal: undefined,
      npmDependents: undefined,
      p50LatencyMs: undefined,
    }),
  ];
  const scored = mcpScorer.computeRaw(items);
  const byId = Object.fromEntries(scored.map((s) => [s.item.id, s.rawScore]));
  assert.ok(
    byId["winner"] > byId["decent"],
    `winner ${byId["winner"]} > decent ${byId["decent"]}`,
  );
  assert.ok(
    byId["decent"] > byId["stub"],
    `decent ${byId["decent"]} > stub ${byId["stub"]}`,
  );
  for (const v of Object.values(byId)) {
    assert.ok(v >= 0 && v <= 100, `value out of range: ${v}`);
  }
});

// ---------------------------------------------------------------------------
// Q4 cold-start absolute-fallback tests (Phase 4 escalation 2026-04-29).
// Day-1 of deployment: npm-downloads / pypi-downloads workflows have not
// yet populated their 7d-ago snapshots. Without abs fallbacks the scorer
// produces a flat ranking. With them an MCP with installsTotal lifts.
// ---------------------------------------------------------------------------

test("mcp abs fallback: installsTotal=12000 + no 7d downloads lifts score above 50", () => {
  const [s] = mcpScorer.computeRaw([
    mk({
      npmDownloads7d: undefined,
      pypiDownloads7d: undefined,
      installsTotal: 12_000,
      isStdio: true, // skip liveness for a clean abs-only path
      toolCount: undefined,
      smitheryRank: undefined,
      smitheryTotal: undefined,
      npmDependents: undefined,
      p50LatencyMs: undefined,
      lastReleaseAt: undefined,
    }),
  ]);
  assert.ok(s.rawComponents.installsAbs !== undefined, "installsAbs should fire");
  assert.equal(s.rawComponents.downloadsCombined7d, undefined);
  assert.equal(s.primaryMetric.label, "Installs");
  assert.ok(s.rawScore > 50, `expected score > 50, got ${s.rawScore}`);
});

test("mcp abs fallback: installsAbs and downloadsCombined7d are mutually exclusive", () => {
  const [s] = mcpScorer.computeRaw([
    mk({ npmDownloads7d: 5_000, installsTotal: 12_000, isStdio: true }),
  ]);
  assert.ok(s.rawComponents.downloadsCombined7d !== undefined);
  assert.equal(s.rawComponents.installsAbs, undefined, "installsAbs must not fire when 7d delta is present");
  assert.equal(s.primaryMetric.label, "Downloads");
});

test("mcp abs fallback: starsAbs is final fallback when nothing else available", () => {
  const [s] = mcpScorer.computeRaw([
    mk({
      npmDownloads7d: undefined,
      pypiDownloads7d: undefined,
      installsTotal: undefined,
      stars: 800,
      isStdio: true,
      toolCount: undefined,
      smitheryRank: undefined,
      smitheryTotal: undefined,
      npmDependents: undefined,
      p50LatencyMs: undefined,
      lastReleaseAt: undefined,
    }),
  ]);
  assert.ok(s.rawComponents.starsAbs !== undefined, "starsAbs should fire");
  assert.equal(s.rawComponents.installsAbs, undefined);
  assert.equal(s.primaryMetric.label, "Stars");
});

test("mcp abs fallback: cold-start no-data path is unchanged (low score, no abs fires)", () => {
  const [s] = mcpScorer.computeRaw([
    mk({
      npmDownloads7d: undefined,
      pypiDownloads7d: undefined,
      installsTotal: undefined,
      stars: undefined,
      isStdio: true,
      toolCount: undefined,
      smitheryRank: undefined,
      smitheryTotal: undefined,
      npmDependents: undefined,
      p50LatencyMs: undefined,
      lastReleaseAt: undefined,
    }),
  ]);
  assert.equal(s.rawComponents.installsAbs, undefined);
  assert.equal(s.rawComponents.starsAbs, undefined);
  // Only crossSourceCount fires by default.
  assert.equal(s.primaryMetric.label, "—");
});

