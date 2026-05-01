// Audit trail for outbound Twitter runs. Every cron run (whether it
// published, logged, or skipped) writes one OutboundRunRecord so we
// can answer operational questions:
//   - did today's daily thread actually go out?
//   - how long has our token been expired (adapter=null runs)?
//   - when we roll back a composer change, what went out under v1?
//
// Storage piggy-backs on the existing JSONL file-persistence layer.
// Writes are atomic via appendJsonlFile.
//
// @internal — consumed only by /api/cron/twitter-* routes; outbound is a
// separate seam from the read/ingest builder and is kept isolated here.

import { randomUUID } from "node:crypto";

import {
  appendJsonlFile,
  readJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";

import type { OutboundRunRecord } from "./types";

export const OUTBOUND_RUNS_FILE = "twitter-outbound-runs.jsonl";

export interface RecordRunInput {
  kind: OutboundRunRecord["kind"];
  adapterName: string;
  status: OutboundRunRecord["status"];
  threadUrl: string | null;
  postCount: number;
  startedAt: string;
  errorMessage?: string | null;
}

/**
 * Append a run record. No mutation — run records are insert-only so
 * we don't need the per-file lock; concurrent cron runs appending to
 * the same file is fine with fs.appendFile's O_APPEND semantics.
 */
export async function recordOutboundRun(
  input: RecordRunInput,
): Promise<OutboundRunRecord> {
  const record: OutboundRunRecord = {
    id: randomUUID(),
    kind: input.kind,
    adapterName: input.adapterName,
    status: input.status,
    threadUrl: input.threadUrl,
    postCount: input.postCount,
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    errorMessage: input.errorMessage ?? null,
  };
  await appendJsonlFile(OUTBOUND_RUNS_FILE, record);
  return record;
}

export async function listOutboundRuns(): Promise<OutboundRunRecord[]> {
  const records = await readJsonlFile<OutboundRunRecord>(OUTBOUND_RUNS_FILE);
  return records.sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
  );
}
