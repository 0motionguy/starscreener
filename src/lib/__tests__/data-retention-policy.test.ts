import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COMPARE_SHARE_RETENTION_DAYS,
  DATA_STORE_DEFAULT_RETENTION_DAYS,
  getDataRetentionPolicy,
  MCP_USAGE_RETENTION_DAYS,
  REPO_BRIEF_RETENTION_DAYS,
} from "../data-retention-policy";
import { SNAPSHOT_HISTORY_CAP } from "../pipeline/storage/memory-stores";
import {
  TWITTER_AUDIT_LOG_MAX_ENTRIES,
  TWITTER_AUDIT_LOG_RETENTION_DAYS,
  TWITTER_SCAN_RETENTION_DAYS,
} from "../twitter/storage";
import { DAILY_RETENTION_DAYS, RAW_EVENTS_RETENTION_DAYS } from "../llm/types";

test("getDataRetentionPolicy exposes current retention windows and caps", () => {
  const policy = getDataRetentionPolicy();
  assert.equal(policy.ok, true);
  assert.equal(policy.version, "2026-05-05");
  assert.equal(policy.entries.length >= 6, true);

  const byId = new Map(policy.entries.map((entry) => [entry.id, entry]));
  assert.equal(byId.get("twitter-scans")?.retentionDays, TWITTER_SCAN_RETENTION_DAYS);
  assert.equal(
    byId.get("twitter-ingestion-audit")?.retentionDays,
    TWITTER_AUDIT_LOG_RETENTION_DAYS,
  );
  assert.equal(
    byId.get("twitter-ingestion-audit")?.maxEntries,
    TWITTER_AUDIT_LOG_MAX_ENTRIES,
  );
  assert.equal(byId.get("mcp-usage-raw")?.retentionDays, MCP_USAGE_RETENTION_DAYS);
  assert.equal(byId.get("llm-events-raw")?.retentionDays, RAW_EVENTS_RETENTION_DAYS);
  assert.equal(
    byId.get("llm-daily-aggregates")?.retentionDays,
    DAILY_RETENTION_DAYS,
  );
  assert.equal(byId.get("pipeline-snapshots")?.maxEntries, SNAPSHOT_HISTORY_CAP);
  assert.equal(
    byId.get("compare-share-payloads")?.retentionDays,
    COMPARE_SHARE_RETENTION_DAYS,
  );
  assert.equal(byId.get("repo-brief-cache")?.retentionDays, REPO_BRIEF_RETENTION_DAYS);
  assert.equal(
    byId.get("data-store-default-ttl")?.retentionDays,
    DATA_STORE_DEFAULT_RETENTION_DAYS,
  );
});

test("GET /api/privacy/retention returns policy envelope", async () => {
  const { GET } = await import("../../app/api/privacy/retention/route");
  const res = await GET();
  assert.equal(res.status, 200);
  assert.equal(
    res.headers.get("cache-control"),
    "public, max-age=300, stale-while-revalidate=3600",
  );

  const body = (await res.json()) as {
    ok: boolean;
    version: string;
    entries: Array<{ id: string }>;
  };
  assert.equal(body.ok, true);
  assert.equal(body.version, "2026-05-05");
  assert.equal(body.entries.some((entry) => entry.id === "mcp-usage-raw"), true);
});
