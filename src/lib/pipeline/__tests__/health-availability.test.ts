import assert from "node:assert/strict";
import { test } from "node:test";

import { getHealthHttpStatusForStatus } from "../../health-status";
import {
  WORKER_HEALTH_DISABLED_SPECS,
  WORKER_HEALTH_SPECS,
} from "../../worker-health-specs";

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
  ]);

  for (const slug of advisory) {
    const spec = WORKER_HEALTH_SPECS.find((item) => item.slug === slug);
    assert.ok(spec, `missing worker health spec for ${slug}`);
    assert.equal(spec.blocking, false, `${slug} must be advisory`);
  }
});

test("/api/worker/health: disabled legacy slugs stay visible but inactive", () => {
  const disabled = new Set(WORKER_HEALTH_DISABLED_SPECS.map((item) => item.slug));
  const active = new Set(WORKER_HEALTH_SPECS.map((item) => item.slug));

  for (const slug of [
    "huggingface-trending",
    "trending-mcp",
    "trending-skill",
    "trending-skill-sh",
    "trending-skill-skillsmp",
    "trending-skill-smithery",
    "trending-skill-lobehub",
  ]) {
    assert.equal(disabled.has(slug), true, `${slug} must be explicitly disabled`);
    assert.equal(active.has(slug), false, `${slug} must not be active worker liveness`);
  }
});

test("/api/worker/health: TrustMRR catalog cadence matches daily producer", () => {
  for (const slug of ["trustmrr-startups", "trustmrr-startups:meta"]) {
    const spec = WORKER_HEALTH_SPECS.find((item) => item.slug === slug);
    assert.ok(spec, `missing worker health spec for ${slug}`);
    assert.equal(spec.cadenceMin, 60 * 24);
  }

  const overlays = WORKER_HEALTH_SPECS.find((item) => item.slug === "revenue-overlays");
  assert.ok(overlays, "missing worker health spec for revenue-overlays");
  assert.equal(overlays.cadenceMin, 60);
});
