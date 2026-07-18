// Content-calendar matrix (CE-4) — fixed dates, no env mutation: the
// override is injected via the third parameter.

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveSlotFormat } from "../twitter/outbound/content-calendar";

// 2026-07-05 = Sunday, 2026-07-06 = Monday, ... (UTC).
const SUN = Date.parse("2026-07-05T12:47:00.000Z");
const MON = Date.parse("2026-07-06T12:47:00.000Z");
const TUE = Date.parse("2026-07-07T12:47:00.000Z");
const WED = Date.parse("2026-07-08T12:47:00.000Z");
const THU = Date.parse("2026-07-09T12:47:00.000Z");
const FRI = Date.parse("2026-07-10T12:47:00.000Z");
const SAT = Date.parse("2026-07-11T12:47:00.000Z");

test("slot A is a TOP single and slot D is a DISCOVERY single every day", () => {
  for (const day of [SUN, MON, TUE, WED, THU, FRI, SAT]) {
    assert.deepEqual(resolveSlotFormat(day, "A", undefined), {
      format: "trending_single",
      ranker: "top",
    });
    assert.deepEqual(resolveSlotFormat(day, "D", undefined), {
      format: "discovery_single",
      ranker: "discovery",
    });
  }
});

test("slot B rotates the themed pack by UTC weekday", () => {
  const expect: Array<[number, string]> = [
    [MON, "ai-agents"],
    [TUE, "rag"],
    [WED, "mcp-tools"],
    [THU, "local-llm"],
    [FRI, "browser-automation"],
    [SAT, "devtools"],
    [SUN, "weekly-top10"],
  ];
  for (const [day, packId] of expect) {
    assert.deepEqual(resolveSlotFormat(day, "B", undefined), {
      format: "trending_pack",
      packId,
      ranker: "top",
    });
  }
});

test("slot C alternates GAINER (even UTC date) / sustained TREND (odd)", () => {
  assert.deepEqual(resolveSlotFormat(MON, "C", undefined), {
    format: "trending_single",
    ranker: "gainer",
  });
  assert.deepEqual(resolveSlotFormat(TUE, "C", undefined), {
    format: "trending_single",
    ranker: "trend",
  });
});

test("slot E rotates the broader builder ecosystem by UTC weekday", () => {
  const expect: Array<[number, string]> = [
    [MON, "security"],
    [TUE, "infrastructure"],
    [WED, "data"],
    [THU, "web-mobile"],
    [FRI, "web3"],
    [SAT, "rust"],
    [SUN, "design-engineering"],
  ];
  for (const [day, packId] of expect) {
    assert.deepEqual(resolveSlotFormat(day, "E", undefined), {
      format: "trending_pack",
      packId,
      ranker: "top",
    });
  }
});

test("X_CALENDAR_OVERRIDE remaps a slot/day cell", () => {
  const override = JSON.stringify({ B: { "0": { format: "trending_single" } } });
  assert.deepEqual(resolveSlotFormat(SUN, "B", override), {
    format: "trending_single",
  });
  // Other days keep the matrix.
  assert.equal(resolveSlotFormat(MON, "B", override).packId, "ai-agents");
});

test("malformed or invalid overrides are ignored", () => {
  assert.equal(resolveSlotFormat(SUN, "B", "{not json").packId, "weekly-top10");
  const badFormat = JSON.stringify({ B: { "0": { format: "yolo" } } });
  assert.equal(resolveSlotFormat(SUN, "B", badFormat).packId, "weekly-top10");
});
