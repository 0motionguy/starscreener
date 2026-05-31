import assert from "node:assert/strict";
import { test } from "node:test";

import { getHealthHttpStatusForStatus } from "../../health-status";
import { WORKER_HEALTH_SPECS } from "../../worker-health-specs";

test("/api/health: stale freshness remains HTTP 200 availability", () => {
  assert.equal(getHealthHttpStatusForStatus("ok", false), 200);
  assert.equal(getHealthHttpStatusForStatus("stale", false), 200);
  assert.equal(getHealthHttpStatusForStatus("error", false), 503);
  assert.equal(getHealthHttpStatusForStatus("error", true), 200);
});

test("/api/worker/health: advisory slugs do not block fleet availability", () => {
  const advisory = new Set([
    "hot-collections",
    "collection-rankings",
    "lobsters-mentions",
    "trending-skill",
    "trending-skill-sh",
    "trending-skill-skillsmp",
    "trending-skill-smithery",
    "trending-skill-lobehub",
  ]);

  for (const slug of advisory) {
    const spec = WORKER_HEALTH_SPECS.find((item) => item.slug === slug);
    assert.ok(spec, `missing worker health spec for ${slug}`);
    assert.equal(spec.blocking, false, `${slug} must be advisory`);
  }
});
