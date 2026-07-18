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

import "server-only";

import { randomUUID } from "node:crypto";

import {
  appendJsonlFile,
  readJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";

import type {
  AdapterPostResult,
  AdapterThreadResult,
  ComposedPost,
  OutboundRunPost,
  OutboundRunRecord,
} from "./types";

/**
 * Zip the composed thread with the adapter's per-post outcome into the
 * audit shape. Adapters return one result per post in order; a missing
 * result (thread aborted mid-way) records as "skipped".
 */
export function zipRunPosts(
  thread: ComposedPost[],
  result: AdapterThreadResult,
): OutboundRunPost[] {
  return thread.map((post, i) => ({
    kind: post.kind,
    text: post.text,
    url: post.url ?? null,
    status: result.posts[i]?.status ?? "skipped",
  }));
}

/**
 * Which featured repos actually got posted before a thread threw
 * mid-way. Adapters attach the posts published so far as
 * `metadata.partialPosts` on the thrown error; the thread layout is
 * [intro, item0..itemN-1, (idea)], so a published result at index j
 * (1..N) maps to `breakouts[j-1]`. Returning these lets the cron route
 * still cool-down the repos that DID post — otherwise a mid-thread
 * failure re-features them the next day (near-duplicate thread).
 *
 * Best-effort and defensive: unknown error shape → empty list.
 */
export function partialPublishedRepos(
  err: unknown,
  breakouts: ReadonlyArray<{ fullName: string }>,
): string[] {
  const meta =
    err && typeof err === "object" && "metadata" in err
      ? (err as { metadata?: Record<string, unknown> }).metadata
      : undefined;
  const partial = meta?.partialPosts;
  if (!Array.isArray(partial)) return [];
  const posts = partial as AdapterPostResult[];
  const featured: string[] = [];
  for (let j = 1; j <= breakouts.length; j++) {
    if (posts[j]?.status === "published") {
      featured.push(breakouts[j - 1]!.fullName);
    }
  }
  return featured;
}

export const OUTBOUND_RUNS_FILE = "twitter-outbound-runs.jsonl";

export interface RecordRunInput {
  kind: OutboundRunRecord["kind"];
  adapterName: string;
  status: OutboundRunRecord["status"];
  threadUrl: string | null;
  postCount: number;
  startedAt: string;
  errorMessage?: string | null;
  featuredRepos?: string[];
  posts?: OutboundRunPost[];
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
    ...(input.featuredRepos ? { featuredRepos: input.featuredRepos } : {}),
    ...(input.posts ? { posts: input.posts } : {}),
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
