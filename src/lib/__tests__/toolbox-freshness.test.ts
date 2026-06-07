import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getToolboxTimestampAgeMs,
  isToolboxTimestampFresh,
} from "../toolbox-freshness";

const NOW = Date.parse("2026-05-31T15:30:00.000Z");
const FOUR_HOURS = 4 * 60 * 60 * 1000;

test("isToolboxTimestampFresh rejects stale toolbox payload timestamps", () => {
  assert.equal(
    isToolboxTimestampFresh("2026-05-31T11:29:59.000Z", FOUR_HOURS, NOW),
    false,
  );
});

test("isToolboxTimestampFresh accepts timestamps inside the source budget", () => {
  assert.equal(
    isToolboxTimestampFresh("2026-05-31T11:30:00.000Z", FOUR_HOURS, NOW),
    true,
  );
});

test("isToolboxTimestampFresh rejects missing, invalid, and far-future timestamps", () => {
  assert.equal(isToolboxTimestampFresh(null, FOUR_HOURS, NOW), false);
  assert.equal(isToolboxTimestampFresh("not-a-date", FOUR_HOURS, NOW), false);
  assert.equal(
    isToolboxTimestampFresh("2026-05-31T15:36:00.000Z", FOUR_HOURS, NOW),
    false,
  );
});

test("getToolboxTimestampAgeMs returns normalized age for valid timestamps", () => {
  assert.equal(
    getToolboxTimestampAgeMs("2026-05-31T15:00:00.000Z", NOW),
    30 * 60 * 1000,
  );
});
