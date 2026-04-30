// TrendingRepo — star-activity unit tests.
//
// Covers the pure chart-prep helpers and the in-memory cache lifecycle.
// The Redis read path is the same per-source pattern as trending.ts and
// is exercised end-to-end by the Vitest integration suite, not here.

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  _resetStarActivityCacheForTests,
  _seedStarActivityForTests,
  deriveChartSeries,
  getStarActivity,
  type StarActivityPayload,
} from "../star-activity";

afterEach(() => {
  _resetStarActivityCacheForTests();
});

function makePayload(): StarActivityPayload {
  return {
    repoId: "vercel/next.js",
    points: [
      { d: "2026-04-01", s: 100, delta: 0 },
      { d: "2026-04-02", s: 110, delta: 10 },
      { d: "2026-04-03", s: 130, delta: 20 },
    ],
    firstObservedAt: "2026-04-01T00:00:00Z",
    backfillSource: "stargazer-api",
    coversFirstStar: true,
    updatedAt: "2026-04-03T00:00:00Z",
  };
}

test("getStarActivity returns null before any seed", () => {
  assert.equal(getStarActivity("vercel/next.js"), null);
});

test("seed → get round-trip is case-insensitive on the repoId", () => {
  const payload = makePayload();
  _seedStarActivityForTests("Vercel/Next.js", payload);
  // Same payload reachable via either casing — chart and OG endpoint
  // arrive with whatever shape the URL gave them.
  assert.equal(getStarActivity("vercel/next.js"), payload);
  assert.equal(getStarActivity("VERCEL/NEXT.JS"), payload);
});

test("deriveChartSeries(date, lin) emits epoch-ms x and raw cumulative y", () => {
  const series = deriveChartSeries(makePayload(), "date", "lin");
  assert.equal(series.points.length, 3);
  assert.equal(series.points[0].x, Date.parse("2026-04-01T00:00:00Z"));
  assert.equal(series.points[2].x, Date.parse("2026-04-03T00:00:00Z"));
  assert.equal(series.points[0].y, 100);
  assert.equal(series.points[2].y, 130);
  assert.equal(series.yMin, 100);
  assert.equal(series.yMax, 130);
});

test("deriveChartSeries(timeline) puts day 0 at the first point", () => {
  const series = deriveChartSeries(makePayload(), "timeline", "lin");
  assert.equal(series.points[0].x, 0);
  assert.equal(series.points[1].x, 1);
  assert.equal(series.points[2].x, 2);
  assert.equal(series.xMin, 0);
  assert.equal(series.xMax, 2);
});

test("deriveChartSeries(log) clamps zero stars to 1 to avoid -Infinity", () => {
  const payload: StarActivityPayload = {
    ...makePayload(),
    points: [
      { d: "2026-04-01", s: 0, delta: 0 },
      { d: "2026-04-02", s: 100, delta: 100 },
    ],
  };
  const series = deriveChartSeries(payload, "date", "log");
  // log10(max(1, 0)) === log10(1) === 0
  assert.equal(series.points[0].y, 0);
  assert.equal(series.points[1].y, Math.log10(100));
  // Tooltip data preserves the raw value so a log chart can still show "0 stars".
  assert.equal(series.points[0].stars, 0);
});

test("deriveChartSeries on empty payload returns zero-length series with bounds", () => {
  const empty: StarActivityPayload = {
    ...makePayload(),
    points: [],
  };
  const series = deriveChartSeries(empty);
  assert.equal(series.points.length, 0);
  assert.equal(series.xMin, 0);
  assert.equal(series.xMax, 0);
  assert.equal(series.yMin, 0);
  assert.equal(series.yMax, 0);
});

test("deriveChartSeries on single-point payload still produces valid bounds", () => {
  const single: StarActivityPayload = {
    ...makePayload(),
    points: [{ d: "2026-04-01", s: 50, delta: 0 }],
  };
  const series = deriveChartSeries(single, "timeline", "lin");
  assert.equal(series.points.length, 1);
  assert.equal(series.xMin, 0);
  assert.equal(series.xMax, 0);
  assert.equal(series.yMin, 50);
  assert.equal(series.yMax, 50);
});
