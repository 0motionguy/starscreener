import assert from "node:assert/strict";
import { test } from "node:test";

import { GET } from "../../app/api/health/sources/route";
import {
  DISABLED_SOURCES,
  KNOWN_SOURCES,
  sourceHealthTracker,
} from "../source-health-tracker";

test("/api/health/sources ignores disabled-source breaker state", async () => {
  sourceHealthTracker.reset();
  for (let i = 0; i < 5; i += 1) {
    sourceHealthTracker.recordFailure("reddit", "HTTP 403");
    sourceHealthTracker.recordFailure("github-search", "HTTP 403");
    sourceHealthTracker.recordFailure("nitter", "instance unavailable");
  }

  const response = await GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(body.summary.openSources, []);
  assert.deepEqual(body.summary.halfOpenSources, []);
  assert.deepEqual(body.summary.neverAttemptedSources, [
    "bluesky",
    "devto",
    "github",
    "hackernews",
  ]);
  assert.deepEqual([...KNOWN_SOURCES].sort(), [
    "bluesky",
    "devto",
    "github",
    "hackernews",
  ]);
  assert.ok(body.summary.disabledSources.includes("reddit"));
  assert.ok(body.summary.disabledSources.includes("github-search"));
  assert.ok(body.summary.disabledSources.includes("nitter"));
  assert.ok(DISABLED_SOURCES.includes("reddit"));
  assert.ok(DISABLED_SOURCES.includes("github-search"));
  assert.ok(DISABLED_SOURCES.includes("nitter"));
  assert.equal(body.sources.reddit, undefined);
  assert.equal(body.sources["github-search"], undefined);
  assert.equal(body.sources.nitter, undefined);
  assert.equal(body.sources.lobsters, undefined);
  assert.equal(body.sources.producthunt, undefined);
});

test("/api/health/sources keeps cold breaker sources visible without degrading availability", async () => {
  sourceHealthTracker.reset();

  const response = await GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.summary.neverAttempted, 4);
  assert.deepEqual(body.summary.neverAttemptedSources, [
    "bluesky",
    "devto",
    "github",
    "hackernews",
  ]);
  assert.equal(body.sources.hackernews.attempted, false);
  assert.equal(body.sources.bluesky.attempted, false);
  assert.equal(body.sources.devto.attempted, false);
  assert.equal(body.sources.github.attempted, false);
});
