// Tests for GET /api/predict/calibration — the public summary surface.
//
// Redirects STARSCREENER_DATA_DIR to a tempdir BEFORE importing anything
// that resolves a file path so we can seed predictions.jsonl with known
// rows and assert the aggregator's output.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_DIR = mkdtempSync(
  join(tmpdir(), "starscreener-predictions-calibration-test-"),
);
process.env.STARSCREENER_DATA_DIR = TMP_DIR;

process.on("exit", () => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

import { PREDICTIONS_FILE } from "../../repo-predictions";
import { PREDICTION_MODEL_VERSION } from "../../predictions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const PREDICTIONS_PATH = join(TMP_DIR, PREDICTIONS_FILE);

function writePredictions(rows: Row[]): void {
  const body =
    rows.length === 0 ? "" : rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(PREDICTIONS_PATH, body, "utf8");
}

function mkRequest(): { nextUrl: URL; headers: Headers } {
  return {
    nextUrl: new URL("http://localhost/api/predict/calibration"),
    headers: new Headers(),
  };
}

function baseRow(overrides: Partial<Row> = {}): Row {
  return {
    id: `row-${Math.random().toString(36).slice(2)}`,
    fullName: "vercel/next.js",
    horizonDays: 7,
    pointEstimate: 150_000,
    lowP10: 140_000,
    highP90: 160_000,
    modelVersion: PREDICTION_MODEL_VERSION,
    generatedAt: "2026-03-01T00:00:00.000Z",
    inputs: {
      stars: 130_000,
      starsDelta24h: 10,
      starsDelta7d: 70,
      starsDelta30d: 300,
      sparklinePoints: 30,
      meanDailyDelta: 10,
      stdDailyDelta: 2,
      capturedAt: "2026-03-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

beforeEach(() => {
  // Reset the file between tests — every test explicitly writes what it needs.
  writePredictions([]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("GET /api/predict/calibration: 200 with summaries=[] when no scored rows", async () => {
  const { GET } = await import("../../../app/api/predict/calibration/route");
  // File has no scored rows — just unscored forecasts.
  writePredictions([baseRow(), baseRow({ horizonDays: 30 })]);

  const req = mkRequest();
  const res = await GET(req as unknown as Parameters<typeof GET>[0]);
  assert.equal(res.status, 200);
  const json = (await res.json()) as {
    ok: boolean;
    summaries: unknown[];
    fetchedAt: string;
  };
  assert.equal(json.ok, true);
  assert.deepEqual(json.summaries, []);
  assert.ok(typeof json.fetchedAt === "string" && json.fetchedAt.length > 0);
});

test("GET /api/predict/calibration: surfaces Cache-Control header", async () => {
  const { GET } = await import("../../../app/api/predict/calibration/route");
  writePredictions([]);
  const req = mkRequest();
  const res = await GET(req as unknown as Parameters<typeof GET>[0]);
  const cc = res.headers.get("Cache-Control");
  assert.ok(cc && cc.includes("s-maxage=300"));
  assert.ok(cc && cc.includes("stale-while-revalidate=600"));
});

test("GET /api/predict/calibration: aggregates across 2 modelVersions x 2 horizons", async () => {
  const { GET } = await import("../../../app/api/predict/calibration/route");

  // Seed 4 scored rows across 4 buckets (v1 x 7, v1 x 30, v2 x 7, v2 x 30).
  // Two rows per bucket so the averages are meaningful.
  const rows: Row[] = [
    // --- v1 x 7 ---
    baseRow({
      id: "v1-7-a",
      horizonDays: 7,
      modelVersion: "v1",
      pointEstimate: 100,
      lowP10: 90,
      highP90: 110,
      actualStarsAtHorizon: 110, // signed +10, |pct| = 10/110
      scoredAt: "2026-03-10T00:00:00.000Z",
    }),
    baseRow({
      id: "v1-7-b",
      horizonDays: 7,
      modelVersion: "v1",
      pointEstimate: 200,
      lowP10: 180,
      highP90: 220,
      actualStarsAtHorizon: 180, // signed -20, |pct| = 20/180, in-band (at boundary)
      scoredAt: "2026-03-10T00:00:00.000Z",
    }),
    // --- v1 x 30 ---
    baseRow({
      id: "v1-30-a",
      horizonDays: 30,
      modelVersion: "v1",
      pointEstimate: 500,
      lowP10: 450,
      highP90: 550,
      actualStarsAtHorizon: 600, // signed +100, out of band
      scoredAt: "2026-04-01T00:00:00.000Z",
    }),
    baseRow({
      id: "v1-30-b",
      horizonDays: 30,
      modelVersion: "v1",
      pointEstimate: 1000,
      lowP10: 900,
      highP90: 1100,
      actualStarsAtHorizon: 950, // signed -50, in band
      scoredAt: "2026-04-01T00:00:00.000Z",
    }),
    // --- v2 x 7 ---
    baseRow({
      id: "v2-7-a",
      horizonDays: 7,
      modelVersion: "v2",
      pointEstimate: 100,
      lowP10: 90,
      highP90: 110,
      actualStarsAtHorizon: 105, // signed +5, in band
      scoredAt: "2026-03-10T00:00:00.000Z",
    }),
    // --- v2 x 30 ---
    baseRow({
      id: "v2-30-a",
      horizonDays: 30,
      modelVersion: "v2",
      pointEstimate: 1000,
      lowP10: 900,
      highP90: 1100,
      actualStarsAtHorizon: 1050, // signed +50, in band
      scoredAt: "2026-04-01T00:00:00.000Z",
    }),
    // Unscored row — must NOT appear in summaries.
    baseRow({ id: "unscored", horizonDays: 7, modelVersion: "v1" }),
  ];
  writePredictions(rows);

  const req = mkRequest();
  const res = await GET(req as unknown as Parameters<typeof GET>[0]);
  assert.equal(res.status, 200);
  const json = (await res.json()) as {
    ok: boolean;
    summaries: Array<{
      modelVersion: string;
      horizonDays: number;
      count: number;
      inBandRate: number;
      mape: number;
      mae: number;
      meanSignedError: number;
    }>;
  };
  assert.equal(json.ok, true);
  assert.equal(json.summaries.length, 4);

  // Ordering: (modelVersion asc, horizonDays asc) — v1/7, v1/30, v2/7, v2/30.
  const byKey = new Map(
    json.summaries.map((s) => [`${s.modelVersion}::${s.horizonDays}`, s]),
  );

  const v1_7 = byKey.get("v1::7")!;
  assert.equal(v1_7.count, 2);
  assert.equal(v1_7.mae, 15); // (10 + 20) / 2
  // meanSignedError = (10 + (-20)) / 2 = -5
  assert.equal(v1_7.meanSignedError, -5);
  assert.equal(v1_7.inBandRate, 1); // 110 ∈ [90,110]; 180 ∈ [180,220]
  const expected_v1_7_mape = ((10 / 110 + 20 / 180) / 2) * 100;
  assert.ok(Math.abs(v1_7.mape - expected_v1_7_mape) < 1e-6);

  const v1_30 = byKey.get("v1::30")!;
  assert.equal(v1_30.count, 2);
  assert.equal(v1_30.mae, 75); // (100 + 50) / 2
  assert.equal(v1_30.meanSignedError, 25); // (100 + (-50)) / 2
  assert.equal(v1_30.inBandRate, 0.5); // 600 out, 950 in

  const v2_7 = byKey.get("v2::7")!;
  assert.equal(v2_7.count, 1);
  assert.equal(v2_7.mae, 5);
  assert.equal(v2_7.meanSignedError, 5);
  assert.equal(v2_7.inBandRate, 1);

  const v2_30 = byKey.get("v2::30")!;
  assert.equal(v2_30.count, 1);
  assert.equal(v2_30.mae, 50);
  assert.equal(v2_30.meanSignedError, 50);
  assert.equal(v2_30.inBandRate, 1);

  // Assert the explicit sort order on the array itself.
  assert.deepEqual(
    json.summaries.map((s) => `${s.modelVersion}::${s.horizonDays}`),
    ["v1::7", "v1::30", "v2::7", "v2::30"],
  );
});
