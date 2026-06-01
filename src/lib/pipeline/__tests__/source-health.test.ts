import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateSourceFreshness,
  isScannerSourceUnproven,
  scannerSourcesBlockPipelineFreshness,
  type ScannerSourceHealth,
} from "../../source-health";

const NOW = Date.parse("2026-04-22T12:00:00.000Z");

test("evaluateSourceFreshness: marks missed cadence as degraded before stale", () => {
  const result = evaluateSourceFreshness({
    fetchedAt: "2026-04-22T03:30:00.000Z",
    cold: false,
    degradedAfterMs: 8 * 60 * 60 * 1000,
    staleAfterMs: 16 * 60 * 60 * 1000,
    nowMs: NOW,
  });

  assert.equal(result.stale, false);
  assert.equal(result.degraded, true);
  assert.equal(result.ageSeconds, 30_600);
});

test("evaluateSourceFreshness: stale outranks degraded", () => {
  const result = evaluateSourceFreshness({
    fetchedAt: "2026-04-21T18:00:00.000Z",
    cold: false,
    degradedAfterMs: 8 * 60 * 60 * 1000,
    staleAfterMs: 16 * 60 * 60 * 1000,
    nowMs: NOW,
  });

  assert.equal(result.stale, true);
  assert.equal(result.degraded, false);
});

test("evaluateSourceFreshness: cold sources do not produce stale/degraded ages", () => {
  const result = evaluateSourceFreshness({
    fetchedAt: null,
    cold: true,
    degradedAfterMs: 8 * 60 * 60 * 1000,
    staleAfterMs: 16 * 60 * 60 * 1000,
    nowMs: NOW,
  });

  assert.equal(result.stale, false);
  assert.equal(result.degraded, false);
  assert.equal(result.ageSeconds, null);
});

test("evaluateSourceFreshness: future timestamps beyond clock skew are stale", () => {
  const result = evaluateSourceFreshness({
    fetchedAt: "2026-04-22T12:10:01.000Z",
    cold: false,
    degradedAfterMs: 8 * 60 * 60 * 1000,
    staleAfterMs: 16 * 60 * 60 * 1000,
    nowMs: NOW,
  });

  assert.equal(result.futureSkew, true);
  assert.equal(result.stale, true);
  assert.equal(result.degraded, false);
  assert.equal(result.ageSeconds, 0);
});

function source(status: ScannerSourceHealth["status"]): ScannerSourceHealth {
  return {
    id: "hackernews",
    label: "Hacker News",
    provider: "hackernews",
    cadence: "hourly",
    fetchedAt: status === "cold" ? null : "2026-04-22T11:30:00.000Z",
    cold: status === "cold",
    stale: status === "stale",
    degraded: status === "degraded",
    status,
    ageSeconds: status === "cold" ? null : 1800,
    staleAfterSeconds: 21_600,
    degradedAfterSeconds: 3600,
    metrics: {},
    notes: [],
  };
}

test("scannerSourcesBlockPipelineFreshness: cold sources are unproven and block freshness", () => {
  const cold = source("cold");
  const ok = source("ok");

  assert.equal(isScannerSourceUnproven(cold), true);
  assert.equal(isScannerSourceUnproven(ok), false);
  assert.equal(scannerSourcesBlockPipelineFreshness([ok]), false);
  assert.equal(scannerSourcesBlockPipelineFreshness([cold]), true);
  assert.equal(scannerSourcesBlockPipelineFreshness([]), true);
});
