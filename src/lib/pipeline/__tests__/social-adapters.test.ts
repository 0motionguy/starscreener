import assert from "node:assert/strict";
import { test } from "node:test";

import { getDefaultSocialAdapters } from "../adapters/social-adapters";
import {
  DISABLED_SOURCES,
  KNOWN_SOURCES,
} from "../../source-health-tracker";

test("default social adapters exclude intentionally disabled live-search sources", () => {
  const ids = getDefaultSocialAdapters().map((adapter) => adapter.id);
  assert.deepEqual(ids, ["hackernews-algolia"]);
  assert.ok(DISABLED_SOURCES.includes("reddit"));
  assert.ok(DISABLED_SOURCES.includes("github-search"));
  assert.ok(DISABLED_SOURCES.includes("nitter"));
  assert.ok(!KNOWN_SOURCES.includes("reddit"));
  assert.ok(!KNOWN_SOURCES.includes("github-search"));
  assert.ok(!KNOWN_SOURCES.includes("nitter"));
});
