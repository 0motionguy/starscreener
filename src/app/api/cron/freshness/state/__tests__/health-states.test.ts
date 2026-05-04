// F7 — Cover the freshness `health` discriminator added in 9b7a17a6.
//
// Rules per freshness-health.ts:deriveHealth:
//   - "stale"    : at least one BLOCKING source is non-GREEN
//   - "advisory" : every blocking source is GREEN, but at least one
//                  non-blocking source is non-GREEN
//   - "ok"       : every source is GREEN
//
// We invoke deriveHealth() directly with synthetic SourceState[] arrays so
// nothing in the route file (Redis, fs, network) needs mocking.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  deriveHealth,
  type FreshnessSourceState,
  type FreshnessSourceStatus,
} from "../../../../../../lib/freshness-health";

type SourceState = FreshnessSourceState & {
  name: string;
  lastUpdate: string | null;
  freshnessBudget: string;
  ageMs: number | null;
};

function source(
  name: string,
  status: FreshnessSourceStatus,
  blocking: boolean,
): SourceState {
  return {
    name,
    lastUpdate: status === "DEAD" ? null : "2026-05-04T00:00:00.000Z",
    freshnessBudget: "6h",
    ageMs: status === "DEAD" ? null : 1000,
    status,
    blocking,
  };
}

test("deriveHealth: all GREEN → ok", () => {
  const sources: SourceState[] = [
    source("trending-repos", "GREEN", true),
    source("mcp-dependents", "GREEN", false),
    source("mcp-smithery-rank", "GREEN", false),
  ];
  assert.equal(deriveHealth(sources), "ok");
});

test("deriveHealth: empty list → ok", () => {
  assert.equal(deriveHealth([]), "ok");
});

test("deriveHealth: only non-blocking degraded → advisory", () => {
  const sources: SourceState[] = [
    source("trending-repos", "GREEN", true),
    source("mcp-dependents", "YELLOW", false),
  ];
  assert.equal(deriveHealth(sources), "advisory");
});

test("deriveHealth: non-blocking RED still advisory (not stale)", () => {
  const sources: SourceState[] = [
    source("trending-repos", "GREEN", true),
    source("mcp-smithery-rank", "RED", false),
  ];
  assert.equal(deriveHealth(sources), "advisory");
});

test("deriveHealth: non-blocking DEAD still advisory (not stale)", () => {
  const sources: SourceState[] = [
    source("trending-repos", "GREEN", true),
    source("mcp-dependents", "DEAD", false),
  ];
  assert.equal(deriveHealth(sources), "advisory");
});

test("deriveHealth: blocking YELLOW → stale", () => {
  const sources: SourceState[] = [
    source("trending-repos", "YELLOW", true),
    source("mcp-dependents", "GREEN", false),
  ];
  assert.equal(deriveHealth(sources), "stale");
});

test("deriveHealth: blocking RED → stale", () => {
  const sources: SourceState[] = [source("trending-repos", "RED", true)];
  assert.equal(deriveHealth(sources), "stale");
});

test("deriveHealth: blocking DEAD → stale", () => {
  const sources: SourceState[] = [source("trending-repos", "DEAD", true)];
  assert.equal(deriveHealth(sources), "stale");
});

test("deriveHealth: blocking degraded wins over non-blocking GREEN", () => {
  const sources: SourceState[] = [
    source("mcp-dependents", "GREEN", false),
    source("mcp-smithery-rank", "GREEN", false),
    source("trending-repos", "RED", true),
  ];
  assert.equal(deriveHealth(sources), "stale");
});

test("deriveHealth: blocking degraded wins over non-blocking degraded", () => {
  const sources: SourceState[] = [
    source("mcp-dependents", "RED", false),
    source("trending-repos", "YELLOW", true),
  ];
  assert.equal(deriveHealth(sources), "stale");
});
