import { DAILY_RETENTION_DAYS, RAW_EVENTS_RETENTION_DAYS } from "@/lib/llm/types";
import { COMPARE_SHARE_TTL_SECONDS } from "@/app/api/compare/share/_lib";
import { REPO_BRIEF_TTL_SECONDS } from "@/lib/briefs";
import { DATA_STORE_DEFAULT_TTL_SECONDS } from "@/lib/data-store";
import { SNAPSHOT_HISTORY_CAP } from "@/lib/pipeline/storage/memory-stores";
import {
  TWITTER_AUDIT_LOG_MAX_ENTRIES,
  TWITTER_AUDIT_LOG_RETENTION_DAYS,
  TWITTER_SCAN_RETENTION_DAYS,
} from "@/lib/twitter/storage";

export const MCP_USAGE_RETENTION_DAYS = 365;
export const COMPARE_SHARE_RETENTION_DAYS = COMPARE_SHARE_TTL_SECONDS / (24 * 60 * 60);
export const REPO_BRIEF_RETENTION_DAYS = REPO_BRIEF_TTL_SECONDS / (24 * 60 * 60);
export const DATA_STORE_DEFAULT_RETENTION_DAYS =
  DATA_STORE_DEFAULT_TTL_SECONDS / (24 * 60 * 60);

export interface DataRetentionPolicyEntry {
  id: string;
  storage: string;
  retentionDays?: number;
  maxEntries?: number;
  notes: string;
}

export interface DataRetentionPolicyDocument {
  ok: true;
  version: string;
  updatedAt: string;
  entries: DataRetentionPolicyEntry[];
}

export function getDataRetentionPolicy(): DataRetentionPolicyDocument {
  return {
    ok: true,
    version: "2026-05-05",
    updatedAt: "2026-05-05T00:00:00.000Z",
    entries: [
      {
        id: "twitter-scans",
        storage: ".data/twitter-scans.jsonl",
        retentionDays: TWITTER_SCAN_RETENTION_DAYS,
        notes:
          "Twitter scan records are kept for rolling 30 days; older rows are pruned on write/hydrate.",
      },
      {
        id: "twitter-ingestion-audit",
        storage: ".data/twitter-ingestion-audit.jsonl",
        retentionDays: TWITTER_AUDIT_LOG_RETENTION_DAYS,
        maxEntries: TWITTER_AUDIT_LOG_MAX_ENTRIES,
        notes:
          "Audit logs are pruned by age and by count cap; newest entries are retained first.",
      },
      {
        id: "mcp-usage-raw",
        storage: ".data/mcp-usage.jsonl",
        retentionDays: MCP_USAGE_RETENTION_DAYS,
        notes:
          "Monthly cron rotation truncates rows older than 365 days.",
      },
      {
        id: "llm-events-raw",
        storage: "redis stream ss:llm:events",
        retentionDays: RAW_EVENTS_RETENTION_DAYS,
        notes:
          "LLM aggregate cron trims raw event stream to rolling 30 days.",
      },
      {
        id: "llm-daily-aggregates",
        storage: "redis json ss:data:v1:llm-daily-*",
        retentionDays: DAILY_RETENTION_DAYS,
        notes:
          "Daily model/feature aggregates keep a 90-day rolling analytics window.",
      },
      {
        id: "pipeline-snapshots",
        storage: "in-memory snapshot store",
        maxEntries: SNAPSHOT_HISTORY_CAP,
        notes:
          "Per-repo snapshot history is capped at 120 entries (~30 days at 6h cadence).",
      },
      {
        id: "compare-share-payloads",
        storage: "redis json ss:data:v1:compare-share/*",
        retentionDays: COMPARE_SHARE_RETENTION_DAYS,
        notes:
          "Shared compare payloads expire after 30 days via data-store ttlSeconds override.",
      },
      {
        id: "repo-brief-cache",
        storage: "redis json ss:data:v1:brief:*",
        retentionDays: REPO_BRIEF_RETENTION_DAYS,
        notes:
          "Repo brief cache entries expire after 30 days via explicit write ttl.",
      },
      {
        id: "data-store-default-ttl",
        storage: "redis payload/meta keys without ttl override",
        retentionDays: DATA_STORE_DEFAULT_RETENTION_DAYS,
        notes:
          "Default data-store write ttl is 24 hours unless a writer sets ttlSeconds.",
      },
    ],
  };
}
