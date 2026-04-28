// TrendingRepo Pipeline — cross-domain assembler tests.

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeCrossDomainMomentum } from "../scoring/cross-domain";
import type {
  DomainItem,
  DomainKey,
  ScoredItem,
} from "../scoring/domain/types";

function mkScored(
  domainKey: DomainKey,
  id: string,
  rawScore: number,
): ScoredItem<DomainItem> {
  return {
    item: { domainKey, id, joinKeys: {} },
    rawComponents: { only: rawScore },
    weights: { only: 1.0 },
    rawScore,
    primaryMetric: { name: "test", value: rawScore, label: "Test" },
    explanation: `Score ${rawScore}`,
  };
}

test("computeCrossDomainMomentum on empty input returns empty map", () => {
  const result = computeCrossDomainMomentum(new Map());
  assert.equal(result.size, 0);
});

test("computeCrossDomainMomentum preserves empty domain arrays", () => {
  const input = new Map<DomainKey, ScoredItem<DomainItem>[]>([
    ["skill", []],
    ["mcp", [mkScored("mcp", "a", 50)]],
  ]);
  const result = computeCrossDomainMomentum(input);
  assert.deepEqual(result.get("skill"), []);
  assert.equal(result.get("mcp")!.length, 1);
});

test("computeCrossDomainMomentum: highest rawScore in domain gets highest momentum", () => {
  const input = new Map<DomainKey, ScoredItem<DomainItem>[]>([
    [
      "skill",
      [
        mkScored("skill", "low", 10),
        mkScored("skill", "mid", 50),
        mkScored("skill", "high", 90),
      ],
    ],
  ]);
  const result = computeCrossDomainMomentum(input);
  const scores = result.get("skill")!;
  const byId = Object.fromEntries(scores.map((s) => [s.item.id, s.momentum]));
  assert.ok(byId["high"] >= byId["mid"]);
  assert.ok(byId["mid"] >= byId["low"]);
  for (const m of Object.values(byId)) {
    assert.ok(m >= 0 && m <= 100);
  }
});

test("computeCrossDomainMomentum preserves input order within each domain", () => {
  const items = [
    mkScored("mcp", "first", 30),
    mkScored("mcp", "second", 80),
    mkScored("mcp", "third", 50),
  ];
  const input = new Map<DomainKey, ScoredItem<DomainItem>[]>([["mcp", items]]);
  const result = computeCrossDomainMomentum(input);
  const ids = result.get("mcp")!.map((s) => s.item.id);
  assert.deepEqual(ids, ["first", "second", "third"]);
});

test("computeCrossDomainMomentum copies through rawComponents/weights/explanation", () => {
  const input = new Map<DomainKey, ScoredItem<DomainItem>[]>([
    ["skill", [mkScored("skill", "x", 42)]],
  ]);
  const result = computeCrossDomainMomentum(input);
  const [s] = result.get("skill")!;
  assert.equal(s.rawScore, 42);
  assert.deepEqual(s.rawComponents, { only: 42 });
  assert.deepEqual(s.weights, { only: 1.0 });
  assert.equal(s.primaryMetric.label, "Test");
  assert.equal(s.explanation, "Score 42");
});

test("computeCrossDomainMomentum operates per-domain independently", () => {
  // Domain A has tight cluster (40,42,44). Domain B has wide spread (10,90).
  // The lowest in A (40) should rank well within A, but a 40 dropped into B
  // would be near the bottom. This proves percentiles are per-domain.
  const input = new Map<DomainKey, ScoredItem<DomainItem>[]>([
    [
      "skill",
      [
        mkScored("skill", "a-lo", 40),
        mkScored("skill", "a-mid", 42),
        mkScored("skill", "a-hi", 44),
      ],
    ],
    [
      "mcp",
      [
        mkScored("mcp", "b-lo", 10),
        mkScored("mcp", "b-hi", 90),
      ],
    ],
  ]);
  const result = computeCrossDomainMomentum(input);
  const aLo = result.get("skill")!.find((s) => s.item.id === "a-lo")!;
  const bLo = result.get("mcp")!.find((s) => s.item.id === "b-lo")!;
  // 40 (lowest in skill) and 10 (lowest in mcp) both get momentum 0 — bottom of their bucket.
  assert.equal(aLo.momentum, 0);
  assert.equal(bLo.momentum, 0);
});
