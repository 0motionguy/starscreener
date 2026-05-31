import assert from "node:assert/strict";
import { test } from "node:test";

import { GET } from "../../app/api/health/sources/route";
import {
  DISABLED_SOURCES,
  sourceHealthTracker,
} from "../source-health-tracker";

test("/api/health/sources ignores disabled-source breaker state", async () => {
  sourceHealthTracker.reset();
  for (let i = 0; i < 5; i += 1) {
    sourceHealthTracker.recordFailure("reddit", "HTTP 403");
    sourceHealthTracker.recordFailure("github-search", "HTTP 403");
  }

  const response = await GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.summary.openSources, []);
  assert.deepEqual(body.summary.halfOpenSources, []);
  assert.ok(body.summary.disabledSources.includes("reddit"));
  assert.ok(body.summary.disabledSources.includes("github-search"));
  assert.ok(DISABLED_SOURCES.includes("reddit"));
  assert.ok(DISABLED_SOURCES.includes("github-search"));
  assert.equal(body.sources.reddit, undefined);
  assert.equal(body.sources["github-search"], undefined);
});
