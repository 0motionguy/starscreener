import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BLUESKY_QUERY_FAMILIES,
  BLUESKY_TRENDING_QUERIES,
  DEVTO_DISCOVERY_SLICES,
  DEVTO_PRIORITY_TAGS,
} from "../_source-watchers.mjs";

test("Bluesky watcher registry covers more than a tiny seed list", () => {
  assert.ok(
    BLUESKY_QUERY_FAMILIES.length >= 8,
    `expected broad topic coverage, got ${BLUESKY_QUERY_FAMILIES.length} families`,
  );
  assert.ok(
    BLUESKY_TRENDING_QUERIES.length >= 15,
    `expected broad query coverage, got ${BLUESKY_TRENDING_QUERIES.length} queries`,
  );
});

test("Bluesky watcher registry keeps core AI-dev families", () => {
  const ids = new Set(BLUESKY_QUERY_FAMILIES.map((family) => family.id));
  for (const required of [
    "agents",
    "llms",
    "coding-agents",
    "mcp",
    "workflow",
    "context",
    "skills",
  ]) {
    assert.ok(ids.has(required), `missing Bluesky family: ${required}`);
  }
});

test("DEV watcher registry includes state slices plus AI/dev tags", () => {
  const stateSet = new Set(
    DEVTO_DISCOVERY_SLICES.map((slice) => slice.state).filter(Boolean),
  );
  assert.ok(stateSet.has("rising"));
  assert.ok(stateSet.has("fresh"));

  for (const requiredTag of [
    "ai",
    "agents",
    "claudecode",
    "llm",
    "mcp",
    "rag",
    "workflow",
    "automation",
    "cli",
    "devtools",
  ]) {
    assert.ok(
      DEVTO_PRIORITY_TAGS.includes(requiredTag),
      `missing DEV tag: ${requiredTag}`,
    );
  }
});
