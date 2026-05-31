import assert from "node:assert/strict";
import { test } from "node:test";

import { getHealthHttpStatusForStatus } from "../../health-status";
import {
  WORKER_HEALTH_DISABLED_SPECS,
  WORKER_HEALTH_SPECS,
} from "../../worker-health-specs";
import {
  applyPayloadHealthToSlugStatus,
  isWorkerHealthStrictlyOk,
  summarizeWorkerPayloadHealth,
} from "../../worker-health-payload";

test("/api/health: stale freshness remains HTTP 200 availability", () => {
  assert.equal(getHealthHttpStatusForStatus("ok", false), 200);
  assert.equal(getHealthHttpStatusForStatus("stale", false), 200);
  assert.equal(getHealthHttpStatusForStatus("error", false), 503);
  assert.equal(getHealthHttpStatusForStatus("error", true), 200);
});

test("/api/worker/health: advisory slugs remain labelled for triage", () => {
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

test("/api/worker/health: fleet ok is zero-tolerance across active tracked slugs", () => {
  const green = {
    amber: 0,
    red: 0,
    missing: 0,
    degradedPayload: 0,
    emptyPayload: 0,
  };

  assert.equal(isWorkerHealthStrictlyOk(green), true);
  assert.equal(isWorkerHealthStrictlyOk({ ...green, amber: 1 }), false);
  assert.equal(isWorkerHealthStrictlyOk({ ...green, red: 1 }), false);
  assert.equal(isWorkerHealthStrictlyOk({ ...green, missing: 1 }), false);
  assert.equal(isWorkerHealthStrictlyOk({ ...green, degradedPayload: 1 }), false);
  assert.equal(isWorkerHealthStrictlyOk({ ...green, emptyPayload: 1 }), false);
});

test("/api/worker/health: critical concrete worker outputs are tracked", () => {
  const active = new Set(WORKER_HEALTH_SPECS.map((item) => item.slug));

  for (const slug of [
    "hn-pulse",
    "recent-repos",
    "deltas",
    "repo-metadata",
    "repo-profiles",
    "trendshift-daily",
    "engagement-composite",
    "consensus-trending",
    "trustmrr-startups",
    "revenue-overlays",
    "hackernews-trending",
    "hackernews-repo-mentions",
    "bluesky-trending",
    "bluesky-mentions",
    "lobsters-trending",
    "lobsters-mentions",
    "producthunt-launches",
    "funding-news-crunchbase",
    "consensus-verdicts",
    "devto-mentions",
    "devto-trending",
    "twitter-repo-signals",
    "aa-llms",
    "openrouter-models",
    "openrouter-usage",
    "repo-registry",
    "mentions-ledger",
    "repo-mentions-detail-rollup",
    "star-activity-deltas",
    "editorial-best",
    "editorial-categories",
    "editorial-compare",
    "editorial-alternatives",
    "manual-repos",
    "npm-packages",
    "revenue-benchmarks",
    "stars-by-category-daily",
    "lmarena-text",
  ]) {
    assert.equal(active.has(slug), true, `${slug} must be worker-health tracked`);
  }
});

test("/api/worker/health: disabled slugs stay visible but inactive", () => {
  const disabled = new Set(WORKER_HEALTH_DISABLED_SPECS.map((item) => item.slug));
  const active = new Set(WORKER_HEALTH_SPECS.map((item) => item.slug));

  for (const slug of [
    "reddit-mentions",
    "reddit-all-posts",
    "reddit-baselines",
    "funding-news-x",
    "github-events:_index",
    "trending-paper",
    "trending-post",
    "huggingface-trending",
    "trending-mcp",
    "mcp-downloads",
    "mcp-downloads-pypi",
    "mcp-dependents",
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
  assert.equal(
    applyPayloadHealthToSlugStatus("green", {
      payloadStatus: "ok",
      dataAsOf: null,
      errorCount: null,
      rowCount: null,
    }),
    "red",
  );
});

test("/api/worker/health: payload row-quality summary covers tracked slugs", () => {
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
  assert.equal(
    summarizeWorkerPayloadHealth("hn-pulse", {
      stories: [{ id: 1 }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("recent-repos", {
      items: [{ fullName: "owner/repo" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("deltas", {
      repos: { "owner/repo": { d7: 1 } },
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("repo-metadata", {
      items: [{ fullName: "owner/repo" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("repo-profiles", {
      profiles: { "owner/repo": { websiteUrl: "https://example.com" } },
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("repo-profiles", {
      profiles: [{ fullName: "owner/repo", websiteUrl: "https://example.com" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("engagement-composite", {
      items: [{ fullName: "owner/repo" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("consensus-trending", {
      items: [{ slug: "owner/repo" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("trustmrr-startups", {
      startups: [{ slug: "acme" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("revenue-overlays", {
      overlays: { "owner/repo": { mrrCents: 1000 } },
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("hackernews-trending", {
      stories: [{ title: "Story" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("hackernews-repo-mentions", {
      mentions: { "owner/repo": [{ title: "Story" }] },
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("bluesky-trending", {
      posts: [{ text: "Post" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("bluesky-mentions", {
      mentions: { "owner/repo": [{ text: "Post" }] },
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("lobsters-trending", {
      stories: [{ title: "Story" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("lobsters-mentions", {
      mentions: { "owner/repo": [{ title: "Story" }] },
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("lobsters-mentions", {
      scannedStories: 75,
      mentions: {},
      leaderboard: [],
    }).rowCount,
    75,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("producthunt-launches", {
      launches: [{ name: "Launch" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("funding-news-crunchbase", {
      fetchedAt: "2026-05-31T20:00:00.000Z",
      signals: [{ company: "Acme" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("consensus-verdicts", {
      computedAt: "2026-05-31T20:00:00.000Z",
      items: { "owner/repo": { verdict: "up" } },
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("devto-mentions", {
      mentions: { "owner/repo": [{ title: "Post" }] },
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("devto-trending", {
      articles: [{ title: "Post" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("twitter-repo-signals", {
      posts: [{ id: "1" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("aa-llms", {
      models: [{ id: "claude" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("openrouter-models", {
      models: [{ id: "openai/gpt-4o" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("openrouter-usage", {
      weeks: [{ week: "2026-05-25" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("lmarena-text", {
      models: [{ modelId: "anthropic/claude" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("repo-registry", {
      repos: { "owner/repo": { stars: 1 } },
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("repo-mentions-detail-rollup", {
      repos: { "owner/repo": { sources: {} } },
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("stars-by-category-daily", {
      days: [{ d: "2026-05-31", byCategory: {} }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("mentions-ledger", {
      entries: [{ repoFullName: "owner/repo" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("editorial-compare", {
      items: { "a__vs__b": { summary: "A vs B" } },
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("manual-repos", {
      items: [{ fullName: "owner/repo" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("npm-packages", {
      packages: [{ name: "pkg" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("reddit-baselines", {
      baselines: { "r/opensource": { posts: 1 } },
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("revenue-benchmarks", {
      buckets: [{ category: "ai" }],
    }).rowCount,
    1,
  );
  assert.equal(
    summarizeWorkerPayloadHealth("devto-trending", {
      wrongShape: [],
    }).rowCount,
    null,
  );
});
