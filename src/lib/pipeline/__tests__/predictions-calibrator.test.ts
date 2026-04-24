// Unit tests for the pure calibrator (src/lib/predictions-calibrator.ts).
//
// Every test pins `now` so the "due vs not-due" gate is deterministic.
// The fixture builder below produces a complete PredictionRecord — we
// only override the fields each test cares about.

import { test } from "node:test";
import assert from "node:assert/strict";

import type { PredictionRecord } from "../../predictions";
import { PREDICTION_MODEL_VERSION } from "../../predictions";
import {
  rehydrateScored,
  scorePredictions,
  summarizeCalibration,
} from "../../predictions-calibrator";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildPrediction(
  overrides: Partial<PredictionRecord> = {},
): PredictionRecord {
  return {
    fullName: "vercel/next.js",
    horizonDays: 7,
    pointEstimate: 150_000,
    lowP10: 140_000,
    highP90: 160_000,
    modelVersion: PREDICTION_MODEL_VERSION,
    generatedAt: "2026-04-01T00:00:00.000Z",
    inputs: {
      stars: 130_000,
      starsDelta24h: 10,
      starsDelta7d: 70,
      starsDelta30d: 300,
      sparklinePoints: 30,
      meanDailyDelta: 10,
      stdDailyDelta: 2,
      capturedAt: "2026-04-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

const AFTER_7D = new Date("2026-04-10T00:00:00.000Z"); // > 7d after 2026-04-01
const BEFORE_7D = new Date("2026-04-05T00:00:00.000Z"); // < 7d after 2026-04-01

// ---------------------------------------------------------------------------
// scorePredictions — gating behavior
// ---------------------------------------------------------------------------

test("scorePredictions: skips rows already carrying scoredAt", () => {
  const row = buildPrediction({
    scoredAt: "2026-04-09T00:00:00.000Z",
    actualStarsAtHorizon: 148_000,
  });
  const map = new Map<string, number>([["vercel/next.js", 155_000]]);
  const out = scorePredictions([row], map, AFTER_7D);
  assert.equal(out.length, 0);
});

test("scorePredictions: skips predictions not yet due", () => {
  const row = buildPrediction();
  const map = new Map<string, number>([["vercel/next.js", 155_000]]);
  const out = scorePredictions([row], map, BEFORE_7D);
  assert.equal(out.length, 0);
});

test("scorePredictions: skips rows whose repo is missing from the stars map", () => {
  const row = buildPrediction();
  const map = new Map<string, number>(); // empty
  const out = scorePredictions([row], map, AFTER_7D);
  assert.equal(out.length, 0);
});

test("scorePredictions: skips rows with unparseable generatedAt", () => {
  const row = buildPrediction({ generatedAt: "not-a-date" });
  const map = new Map<string, number>([["vercel/next.js", 155_000]]);
  const out = scorePredictions([row], map, AFTER_7D);
  assert.equal(out.length, 0);
});

// ---------------------------------------------------------------------------
// scorePredictions — error math
// ---------------------------------------------------------------------------

test("scorePredictions: computes errors correctly (undershoot — positive signed error)", () => {
  // pointEstimate=150_000, actual=155_000 → model undershot by 5000
  const row = buildPrediction();
  const map = new Map<string, number>([["vercel/next.js", 155_000]]);
  const out = scorePredictions([row], map, AFTER_7D);
  assert.equal(out.length, 1);
  const scored = out[0]!;
  assert.equal(scored.actualStarsAtHorizon, 155_000);
  assert.equal(scored.signedError, 5000);
  assert.equal(scored.absoluteError, 5000);
  // 5000 / 155000 = 0.03225...
  assert.ok(Math.abs(scored.percentError - 5000 / 155_000) < 1e-9);
  assert.equal(scored.inBand, true); // 155k ∈ [140k, 160k]
  assert.equal(scored.scoredAt, AFTER_7D.toISOString());
});

test("scorePredictions: computes errors correctly (overshoot — negative signed error)", () => {
  // pointEstimate=150_000, actual=145_000 → model overshot by 5000
  const row = buildPrediction();
  const map = new Map<string, number>([["vercel/next.js", 145_000]]);
  const out = scorePredictions([row], map, AFTER_7D);
  assert.equal(out.length, 1);
  const scored = out[0]!;
  assert.equal(scored.signedError, -5000);
  assert.equal(scored.absoluteError, 5000);
  assert.ok(Math.abs(scored.percentError - -5000 / 145_000) < 1e-9);
  assert.equal(scored.inBand, true); // 145k ∈ [140k, 160k]
});

test("scorePredictions: inBand true at exact lowP10 boundary", () => {
  // actual == lowP10 → inclusive inBand.
  const row = buildPrediction({ lowP10: 140_000, highP90: 160_000 });
  const map = new Map<string, number>([["vercel/next.js", 140_000]]);
  const out = scorePredictions([row], map, AFTER_7D);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.inBand, true);
});

test("scorePredictions: inBand true at exact highP90 boundary", () => {
  // actual == highP90 → inclusive inBand.
  const row = buildPrediction({ lowP10: 140_000, highP90: 160_000 });
  const map = new Map<string, number>([["vercel/next.js", 160_000]]);
  const out = scorePredictions([row], map, AFTER_7D);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.inBand, true);
});

test("scorePredictions: inBand false outside [lowP10, highP90]", () => {
  const row = buildPrediction({ lowP10: 140_000, highP90: 160_000 });
  const below = new Map<string, number>([["vercel/next.js", 139_999]]);
  const above = new Map<string, number>([["vercel/next.js", 160_001]]);
  assert.equal(
    scorePredictions([row], below, AFTER_7D)[0]!.inBand,
    false,
  );
  assert.equal(
    scorePredictions([row], above, AFTER_7D)[0]!.inBand,
    false,
  );
});

test("scorePredictions: fullName lookup is case-insensitive (caller lowercases map keys)", () => {
  const row = buildPrediction({ fullName: "Vercel/Next.JS" });
  const map = new Map<string, number>([["vercel/next.js", 155_000]]);
  const out = scorePredictions([row], map, AFTER_7D);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.actualStarsAtHorizon, 155_000);
});

test("scorePredictions: is pure — deterministic given same inputs", () => {
  const row = buildPrediction();
  const map = new Map<string, number>([["vercel/next.js", 155_000]]);
  const a = scorePredictions([row], map, AFTER_7D);
  const b = scorePredictions([row], map, AFTER_7D);
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------
// summarizeCalibration + rehydrateScored
// ---------------------------------------------------------------------------

test("summarizeCalibration: empty input → empty output", () => {
  assert.deepEqual(summarizeCalibration([]), []);
});

test("summarizeCalibration: buckets by (modelVersion, horizonDays)", () => {
  const rows = [
    buildPrediction({ horizonDays: 7, pointEstimate: 100, lowP10: 90, highP90: 110, generatedAt: "2026-03-01T00:00:00.000Z" }),
    buildPrediction({ horizonDays: 7, pointEstimate: 200, lowP10: 180, highP90: 220, generatedAt: "2026-03-01T00:00:00.000Z" }),
    buildPrediction({ horizonDays: 30, pointEstimate: 300, lowP10: 270, highP90: 330, generatedAt: "2026-03-01T00:00:00.000Z" }),
  ];
  const map = new Map<string, number>([["vercel/next.js", 100]]); // we'll override below
  // Score each with a distinct "actual" by temporarily swapping the map.
  const scored = [
    scorePredictions([rows[0]!], new Map([["vercel/next.js", 110]]), AFTER_7D)[0]!, // signed +10, absPct 10/110
    scorePredictions([rows[1]!], new Map([["vercel/next.js", 180]]), AFTER_7D)[0]!, // signed -20, absPct 20/180
    scorePredictions(
      [rows[2]!],
      new Map([["vercel/next.js", 330]]),
      new Date("2026-06-01T00:00:00.000Z"), // +60d so 30d horizon is due
    )[0]!, // signed +30, absPct 30/330
  ];
  void map; // silence unused-local warning

  const summaries = summarizeCalibration(scored);
  assert.equal(summaries.length, 2);
  // horizonDays ascending within the same modelVersion.
  assert.equal(summaries[0]!.horizonDays, 7);
  assert.equal(summaries[0]!.count, 2);
  assert.equal(summaries[1]!.horizonDays, 30);
  assert.equal(summaries[1]!.count, 1);

  // Bucket 7: mae = (10 + 20) / 2 = 15; mape = ((10/110 + 20/180) / 2) * 100
  const expectedMape7 =
    ((10 / 110 + 20 / 180) / 2) * 100;
  assert.ok(Math.abs(summaries[0]!.mape - expectedMape7) < 1e-6);
  assert.equal(summaries[0]!.mae, 15);
  // inBand: 110 ∈ [90, 110] yes; 180 ∈ [180, 220] yes → 2/2
  assert.equal(summaries[0]!.inBandRate, 1);
  // meanSignedError: (10 + (-20)) / 2 = -5
  assert.equal(summaries[0]!.meanSignedError, -5);

  // Bucket 30: single row, signed +30, in-band (330 ∈ [270, 330]).
  assert.equal(summaries[1]!.mae, 30);
  assert.equal(summaries[1]!.meanSignedError, 30);
  assert.equal(summaries[1]!.inBandRate, 1);
});

test("rehydrateScored: reproduces the derived fields from persisted ones", () => {
  const row = {
    ...buildPrediction({ pointEstimate: 150_000, lowP10: 140_000, highP90: 160_000 }),
    actualStarsAtHorizon: 155_000,
    scoredAt: "2026-04-09T00:00:00.000Z",
  };
  const hydrated = rehydrateScored(row);
  assert.equal(hydrated.signedError, 5000);
  assert.equal(hydrated.absoluteError, 5000);
  assert.ok(Math.abs(hydrated.percentError - 5000 / 155_000) < 1e-9);
  assert.equal(hydrated.inBand, true);
});
