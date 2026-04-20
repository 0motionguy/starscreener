import { test } from "node:test";
import assert from "node:assert/strict";

import type { AlertEvent } from "../types";
import {
  buildBrowserAlertBody,
  buildBrowserAlertTitle,
  getNewAlertEvents,
  mergeSeenAlertIds,
  parseSeenAlertIds,
} from "../../browser-alerts";

function mockAlert(overrides: Partial<AlertEvent> = {}): AlertEvent {
  return {
    id: "rule_1:1:a",
    ruleId: "rule_1",
    repoId: "openai--openai-agents-python",
    userId: "local",
    trigger: "star_spike",
    title: "+250 stars in 24h",
    body: "openai/openai-agents-python is accelerating fast",
    url: "/repo/openai/openai-agents-python",
    firedAt: "2026-04-20T08:00:00.000Z",
    readAt: null,
    conditionValue: 250,
    threshold: 100,
    ...overrides,
  };
}

test("parseSeenAlertIds tolerates invalid storage payloads", () => {
  assert.deepEqual(parseSeenAlertIds(null), []);
  assert.deepEqual(parseSeenAlertIds("not-json"), []);
  assert.deepEqual(parseSeenAlertIds('{"bad":true}'), []);
});

test("mergeSeenAlertIds deduplicates while preserving order", () => {
  const merged = mergeSeenAlertIds(
    ["a", "b", "c"],
    ["b", "d", "e", "a"],
  );
  assert.deepEqual(merged, ["a", "b", "c", "d", "e"]);
});

test("getNewAlertEvents returns only unread unseen events", () => {
  const unseen = mockAlert({ id: "one" });
  const seen = mockAlert({ id: "two" });
  const read = mockAlert({ id: "three", readAt: "2026-04-20T08:05:00.000Z" });
  const fresh = getNewAlertEvents([unseen, seen, read], new Set(["two"]));
  assert.deepEqual(fresh.map((event) => event.id), ["one"]);
});

test("browser alert text falls back cleanly when repo/body are missing", () => {
  const titled = buildBrowserAlertTitle(
    mockAlert(),
    "openai/openai-agents-python",
  );
  assert.equal(titled, "openai/openai-agents-python · +250 stars in 24h");

  const fallbackBody = buildBrowserAlertBody(mockAlert({ body: "" }));
  assert.equal(fallbackBody, "Open StarScreener for alert details.");
});
