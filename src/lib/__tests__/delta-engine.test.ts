// Delta Engine precedence + display-gating tests.
//
// Guards the single source-precedence resolver that feeds the homepage
// Top/Gainer/Trend tabs. The regression this protects against: an
// api.ossinsight.io outage blanking every 7d/30d delta because the registry
// path had no GitHub-direct (star-activity) fallback. The invariant: 7d/30d
// MUST prefer star-activity so they survive an OSS Insight outage, while 24h
// keeps its OSS-first ordering.

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  resolveDelta,
  isRealSA,
  isRealSnap,
  type OssBucket,
} from "../derived-repos/delta-engine";
import type { DeltaValue } from "../trending";
import type { SADeltaValue } from "../star-activity-deltas";

const NO_OSS: OssBucket = { has: false, value: 0 };

function sa(value: number, basis: SADeltaValue["basis"]): SADeltaValue {
  return { value, basis };
}
function snap(value: number | null, basis: DeltaValue["basis"]): DeltaValue {
  return { value, basis, from_commit: "", from_ts: 0 } as DeltaValue;
}

test("7d prefers star-activity over OSS bucket and snapshot", () => {
  const r = resolveDelta(
    "7d",
    { has: true, value: 5 },
    sa(70, "nearest"),
    snap(9, "nearest"),
  );
  assert.equal(r.value, 70);
  assert.equal(r.missing, false);
  assert.equal(r.rank, 70);
});

test("30d prefers star-activity (authoritative GitHub-direct source)", () => {
  const r = resolveDelta("30d", NO_OSS, sa(300, "exact"), snap(12, "cold-start"));
  assert.equal(r.value, 300);
  assert.equal(r.missing, false);
});

test("24h keeps OSS bucket first even when star-activity is real", () => {
  const r = resolveDelta(
    "24h",
    { has: true, value: 12 },
    sa(99, "exact"),
    snap(8, "nearest"),
  );
  assert.equal(r.value, 12);
});

test("24h falls to snapshot (real) before star-activity", () => {
  const r = resolveDelta("24h", NO_OSS, sa(50, "exact"), snap(8, "nearest"));
  assert.equal(r.value, 8); // snapshot wins the 24h fallback slot
});

test("24h falls to star-activity when OSS absent and snapshot is cold-start", () => {
  const r = resolveDelta("24h", NO_OSS, sa(40, "nearest"), snap(3, "cold-start"));
  assert.equal(r.value, 40);
  assert.equal(r.missing, false);
});

test("7d cold-start gates DISPLAY to — but still RANKS", () => {
  const r = resolveDelta("7d", NO_OSS, sa(30, "cold-start"), undefined);
  assert.equal(r.value, 0); // displayed "—"
  assert.equal(r.missing, true);
  assert.equal(r.rank, 30); // ranking tolerates the cold-start number
});

test("nothing real → value 0, missing, rank 0", () => {
  const r = resolveDelta("7d", NO_OSS, undefined, undefined);
  assert.deepEqual(r, { value: 0, missing: true, rank: 0 });
});

test("display gating: cold-start is not real, exact/nearest are", () => {
  assert.equal(isRealSA(sa(10, "cold-start")), false);
  assert.equal(isRealSA(sa(10, "nearest")), true);
  assert.equal(isRealSA(sa(10, "exact")), true);
  assert.equal(isRealSA({ value: null, basis: "no-history" }), false);
  assert.equal(isRealSnap(snap(10, "cold-start")), false);
  assert.equal(isRealSnap(snap(10, "nearest")), true);
  assert.equal(isRealSnap(snap(null, "no-history")), false);
});
