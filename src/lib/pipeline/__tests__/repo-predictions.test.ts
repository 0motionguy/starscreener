// Tests for src/lib/repo-predictions.ts — the repo-profile loader that
// reads .data/predictions.jsonl and surfaces the right forecast row
// for a given repo.
//
// Every test writes a fresh predictions.jsonl and resets the module
// cache before running so mtime-based memoization cannot leak state.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_DIR = mkdtempSync(
  join(tmpdir(), "starscreener-repo-predictions-test-"),
);
process.env.STARSCREENER_DATA_DIR = TMP_DIR;

import {
  __resetRepoPredictionsCacheForTests,
  getPredictionForRepo,
  PREDICTIONS_FILE,
} from "../../repo-predictions";

process.on("exit", () => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

interface RowInput {
  fullName?: string;
  horizonDays?: number;
  pointEstimate?: number;
  lowP10?: number;
  highP90?: number;
  modelVersion?: string;
  generatedAt?: string;
  inputs?: { stars?: number };
}

let nextMtime = Date.now();

function writeRows(rows: RowInput[]): void {
  const path = join(TMP_DIR, PREDICTIONS_FILE);
  const content = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(path, content, "utf8");
  // Bump mtime so the loader invalidates its cache on every test.
  nextMtime += 1000;
  const when = new Date(nextMtime);
  utimesSync(path, when, when);
}

function buildRow(overrides: RowInput = {}): RowInput {
  return {
    fullName: "vercel/next.js",
    horizonDays: 30,
    pointEstimate: 140_000,
    lowP10: 130_000,
    highP90: 155_000,
    modelVersion: "v1-velocity-extrapolation",
    generatedAt: "2026-04-20T12:00:00.000Z",
    inputs: { stars: 125_000 },
    ...overrides,
  };
}

beforeEach(() => {
  __resetRepoPredictionsCacheForTests();
  // Wipe the file to an empty state; individual tests overwrite.
  writeFileSync(join(TMP_DIR, PREDICTIONS_FILE), "", "utf8");
});

// ---------------------------------------------------------------------------
// Missing / empty file
// ---------------------------------------------------------------------------

test("returns null when predictions file is empty", () => {
  __resetRepoPredictionsCacheForTests();
  writeFileSync(join(TMP_DIR, PREDICTIONS_FILE), "", "utf8");
  const result = getPredictionForRepo("vercel/next.js");
  assert.equal(result, null);
});

test("returns null when predictions file is missing", () => {
  __resetRepoPredictionsCacheForTests();
  // Remove the file entirely.
  rmSync(join(TMP_DIR, PREDICTIONS_FILE), { force: true });
  const result = getPredictionForRepo("vercel/next.js");
  assert.equal(result, null);
});

test("returns null when no row matches the repo", () => {
  writeRows([buildRow({ fullName: "facebook/react" })]);
  __resetRepoPredictionsCacheForTests();
  const result = getPredictionForRepo("vercel/next.js");
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// Basic happy path
// ---------------------------------------------------------------------------

test("returns the row for a matching repo (case-insensitive)", () => {
  writeRows([buildRow()]);
  __resetRepoPredictionsCacheForTests();
  const result = getPredictionForRepo("Vercel/Next.js");
  assert.ok(result);
  assert.equal(result.pointEstimate, 140_000);
  assert.equal(result.p10, 130_000);
  assert.equal(result.p90, 155_000);
  assert.equal(result.horizonDays, 30);
  assert.equal(result.modelVersion, "v1-velocity-extrapolation");
  assert.equal(result.baseline, 125_000);
});

// ---------------------------------------------------------------------------
// Dedupe by generatedAt
// ---------------------------------------------------------------------------

test("dedupes by (horizon, modelVersion) keeping the newest generatedAt", () => {
  writeRows([
    buildRow({
      pointEstimate: 100_000,
      generatedAt: "2026-04-10T12:00:00.000Z",
    }),
    buildRow({
      pointEstimate: 140_000,
      generatedAt: "2026-04-20T12:00:00.000Z",
    }),
    buildRow({
      pointEstimate: 120_000,
      generatedAt: "2026-04-15T12:00:00.000Z",
    }),
  ]);
  __resetRepoPredictionsCacheForTests();
  const result = getPredictionForRepo("vercel/next.js");
  assert.ok(result);
  assert.equal(
    result.pointEstimate,
    140_000,
    "should keep the 2026-04-20 row (newest)",
  );
  assert.equal(result.generatedAt, "2026-04-20T12:00:00.000Z");
});

// ---------------------------------------------------------------------------
// Horizon selection — closest to 30 days
// ---------------------------------------------------------------------------

test("selects the horizon closest to 30 days when multiple exist", () => {
  writeRows([
    buildRow({ horizonDays: 7, pointEstimate: 127_000 }),
    buildRow({ horizonDays: 30, pointEstimate: 140_000 }),
    buildRow({ horizonDays: 90, pointEstimate: 190_000 }),
  ]);
  __resetRepoPredictionsCacheForTests();
  const result = getPredictionForRepo("vercel/next.js");
  assert.ok(result);
  assert.equal(result.horizonDays, 30);
  assert.equal(result.pointEstimate, 140_000);
});

test("falls back to the nearest horizon when 30 is missing", () => {
  writeRows([
    buildRow({ horizonDays: 7, pointEstimate: 127_000 }),
    buildRow({ horizonDays: 90, pointEstimate: 190_000 }),
  ]);
  __resetRepoPredictionsCacheForTests();
  const result = getPredictionForRepo("vercel/next.js");
  assert.ok(result);
  // 7 is 23 away from 30; 90 is 60 away — 7 wins.
  assert.equal(result.horizonDays, 7);
});

// ---------------------------------------------------------------------------
// Malformed rows
// ---------------------------------------------------------------------------

test("skips malformed JSONL lines but surfaces valid rows", () => {
  const path = join(TMP_DIR, PREDICTIONS_FILE);
  const lines = [
    "not-json-at-all",
    JSON.stringify({ fullName: "vercel/next.js" }), // missing required fields
    JSON.stringify(buildRow()),
  ];
  writeFileSync(path, lines.join("\n") + "\n", "utf8");
  nextMtime += 1000;
  const when = new Date(nextMtime);
  utimesSync(path, when, when);
  __resetRepoPredictionsCacheForTests();

  const result = getPredictionForRepo("vercel/next.js");
  assert.ok(result);
  assert.equal(result.pointEstimate, 140_000);
});
