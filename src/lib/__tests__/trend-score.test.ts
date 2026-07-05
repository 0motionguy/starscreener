// Tests for the sustained-trend score that decouples the TREND tail from
// GAINER's absolute-24h axis by scoring PRIOR growth (d30 - d24).

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Repo } from "../types";
import { sustainedTrendScore } from "../ranking/trend-score";

const repo = (d24: number, d7: number, d30: number): Repo =>
  ({ starsDelta24h: d24, starsDelta7d: d7, starsDelta30d: d30 }) as Repo;

test("a durable multi-week climber outscores a one-day spike", () => {
  const climber = sustainedTrendScore(repo(10, 80, 320)); // steady climb, small today
  const spike = sustainedTrendScore(repo(100, 100, 100)); // all of it landed today
  assert.ok(climber > spike, `climber ${climber} should beat spike ${spike}`);
});

test("a pure one-day gainer (today == the whole window) scores 0 — leaves TREND", () => {
  assert.equal(sustainedTrendScore(repo(300, 300, 300)), 0);
  assert.equal(sustainedTrendScore(repo(200, 200, 0)), 0); // brand-new, no 30d history
});

test("prior growth is what's scored: 29-day remainder, daily-ized", () => {
  // d30=320, d24=10 -> (320-10)/29 stars/day of prior growth.
  assert.ok(Math.abs(sustainedTrendScore(repo(10, 80, 320)) - (320 - 10) / 29) < 1e-9);
});

test("falls back to the 7d prior window when there is no 30d history", () => {
  // d30=0 -> (d7 - d24)/6 = (70-10)/6 = 10.
  assert.ok(Math.abs(sustainedTrendScore(repo(10, 70, 0)) - 10) < 1e-9);
});

test("zero / negative / inconsistent movement scores 0", () => {
  assert.equal(sustainedTrendScore(repo(0, 0, 0)), 0);
  assert.equal(sustainedTrendScore(repo(-5, -5, -5)), 0);
  assert.equal(sustainedTrendScore(repo(500, 100, 100)), 0); // d24 > d30 (source skew) -> clamp 0
});
