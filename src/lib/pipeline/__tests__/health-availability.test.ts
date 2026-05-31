import assert from "node:assert/strict";
import { test } from "node:test";

import { getHealthHttpStatusForStatus } from "../../health-status";
import {
  WORKER_HEALTH_DISABLED_SPECS,
  WORKER_HEALTH_SPECS,
} from "../../worker-health-specs";
import {
  applyPayloadHealthToSlugStatus,
  summarizeWorkerPayloadHealth,
} from "../../worker-health-payload";

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
    "reddit-mentions",
    "reddit-all-posts",
    "github-events:_index",
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

test("/api/worker/health: degraded payloads are not reported as pure green", () => {
  assert.equal(
    applyPayloadHealthToSlugStatus("green", {
      payloadStatus: "degraded",
      dataAsOf: "2026-05-31T20:00:00.000Z",
      errorCount: 1,
      rowCount: 10,
    }),
    "amber",
  );
  assert.equal(
    applyPayloadHealthToSlugStatus("green", {
      payloadStatus: "ok",
      dataAsOf: null,
      errorCount: null,
      rowCount: 0,
    }),
    "red",
  );
});

test("/api/worker/health: payload row-quality summary covers OSSInsight slugs", () => {
  assert.deepEqual(
    summarizeWorkerPayloadHealth("trending", {
      status: "degraded",
      dataAsOf: "2026-05-31T20:00:00.000Z",
      errors: [{ stage: "bucket:past_week/Rust", message: "500" }],
      buckets: {
        past_week: {
          Rust: [{ repo_name: "cached/project" }],
          Go: [{ repo_name: "cached/go" }],
        },
      },
    }),
    {
      payloadStatus: "degraded",
      dataAsOf: "2026-05-31T20:00:00.000Z",
      errorCount: 1,
      rowCount: 2,
    },
  );
  assert.equal(
    summarizeWorkerPayloadHealth("collection-rankings", {
      collections: {
        "10139": {
          stars: [{ repoName: "cached/project" }],
          issues: [],
        },
      },
    }).rowCount,
    1,
  );
});
