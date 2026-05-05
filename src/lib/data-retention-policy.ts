import { DAILY_RETENTION_DAYS, RAW_EVENTS_RETENTION_DAYS } from "@/lib/llm/types";
import { SNAPSHOT_HISTORY_CAP } from "@/lib/pipeline/storage/memory-stores";
import {
  TWITTER_AUDIT_LOG_MAX_ENTRIES,
  TWITTER_AUDIT_LOG_RETENTION_DAYS,
  TWITTER_SCAN_RETENTION_DAYS,
} from "@/lib/twitter/storage";

export const MCP_USAGE_RETENTION_DAYS = 365;

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
    ],
  };
}
