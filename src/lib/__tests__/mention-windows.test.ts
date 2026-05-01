import { test } from "node:test";
import assert from "node:assert/strict";

import {
  countMentionsInWindow,
  WINDOW_24H,
  WINDOW_7D,
  WINDOW_30D,
} from "../mention-windows";

const NOW = Date.parse("2026-05-01T12:00:00.000Z");

test("countMentionsInWindow handles ISO postedAt (devto / twitter shape)", () => {
  const rows = [
    { postedAt: "2026-05-01T10:00:00.000Z" }, // 2h ago — inside 24h
    { postedAt: "2026-04-30T08:00:00.000Z" }, // 28h ago — outside 24h, inside 7d
    { postedAt: "2026-04-10T12:00:00.000Z" }, // 21d ago — inside 30d, outside 7d
    { postedAt: "2026-01-01T00:00:00.000Z" }, // outside 30d
  ];
  assert.equal(countMentionsInWindow(rows, WINDOW_24H, NOW), 1);
  assert.equal(countMentionsInWindow(rows, WINDOW_7D, NOW), 2);
  assert.equal(countMentionsInWindow(rows, WINDOW_30D, NOW), 3);
});

test("countMentionsInWindow handles createdUtc epoch seconds (HN / Reddit / Lobsters)", () => {
  const nowSec = Math.floor(NOW / 1000);
  const rows = [
    { createdUtc: nowSec - 3600 }, // 1h ago
    { createdUtc: nowSec - 26 * 3600 }, // 26h ago
    { createdUtc: nowSec - 8 * 86400 }, // 8d ago
  ];
  assert.equal(countMentionsInWindow(rows, WINDOW_24H, NOW), 1);
  assert.equal(countMentionsInWindow(rows, WINDOW_7D, NOW), 2);
  assert.equal(countMentionsInWindow(rows, WINDOW_30D, NOW), 3);
});

test("countMentionsInWindow handles created_at ISO (Bluesky fallback)", () => {
  const rows = [{ created_at: "2026-04-30T20:00:00.000Z" }]; // 16h ago
  assert.equal(countMentionsInWindow(rows, WINDOW_24H, NOW), 1);
});

test("countMentionsInWindow skips rows with no timestamp", () => {
  const rows = [{}, { postedAt: "" }, { createdUtc: undefined }];
  assert.equal(countMentionsInWindow(rows, WINDOW_24H, NOW), 0);
});

test("countMentionsInWindow returns 0 for empty / null inputs", () => {
  assert.equal(countMentionsInWindow([], WINDOW_24H, NOW), 0);
  assert.equal(countMentionsInWindow(null, WINDOW_24H, NOW), 0);
  assert.equal(countMentionsInWindow(undefined, WINDOW_24H, NOW), 0);
});

test("countMentionsInWindow rejects invalid windowMs", () => {
  const rows = [{ postedAt: "2026-05-01T11:00:00.000Z" }];
  assert.equal(countMentionsInWindow(rows, 0, NOW), 0);
  assert.equal(countMentionsInWindow(rows, -1, NOW), 0);
  assert.equal(countMentionsInWindow(rows, Number.NaN, NOW), 0);
});

test("countMentionsInWindow accepts numeric epoch postedAt (auto-detects sec vs ms)", () => {
  const nowSec = Math.floor(NOW / 1000);
  const rowsSec = [{ postedAt: nowSec - 3600 }];
  const rowsMs = [{ postedAt: NOW - 3_600_000 }];
  assert.equal(countMentionsInWindow(rowsSec, WINDOW_24H, NOW), 1);
  assert.equal(countMentionsInWindow(rowsMs, WINDOW_24H, NOW), 1);
});
