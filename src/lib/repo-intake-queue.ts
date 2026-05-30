// DORP intake queue — producer side.
//
// PROBLEM
//   Today's POST handler invokes `runRepoIntakeForSubmission` inline, which
//   pulls metadata + sweeps cross-source mentions synchronously in the
//   request handler (5–30s wall, well past the 10s p95 budget). Under burst
//   load the GitHub PAT pool can also exhaust before the user sees ack.
//
// SOLUTION
//   Producer LPUSHes a small payload onto a Redis list (`queue:drop-a-repo`).
//   The worker (apps/trendingrepo-worker, deployed to TOOLBOX) runs the
//   `drop-intake-drain` fetcher every minute, RPOPs up to N items, and runs
//   the enrichment off the user's request path. The POST handler returns
//   `{ ok, id, status: "queued" }` in <100ms.
//
// QUEUE SHAPE
//   The list at `queue:drop-a-repo` holds JSON-stringified `DropQueuePayload`
//   objects. Newest items are at the LEFT (LPUSH); the worker RPOPs from
//   the RIGHT for FIFO ordering. Each payload references the submission by
//   id only — the worker reads the full record from the data-store.
//
// DURABILITY
//   The Redis list survives app restarts and worker restarts. If the
//   worker is mid-deploy, items pile up until the new instance comes back
//   and drains. Failed enrich attempts are requeued with retry metadata;
//   exhausted attempts move to `queue:drop-a-repo:dead`.
//   Visibility via `peekQueueDepth()`.

import { getDataStore } from "@/lib/data-store";

const QUEUE_KEY = "queue:drop-a-repo";

export interface DropQueuePayload {
  /** Submission record id (stored separately at `ss:data:v1:repo-submissions`). */
  submissionId: string;
  /** Repo full name (`owner/name`) — duplicated for log/observability. */
  fullName: string;
  /** Wall-clock when the producer LPUSHed. */
  enqueuedAt: string;
  /** Producer attribution: "web:repo-submissions" today, may grow later. */
  source: string;
  /** Number of failed enrich attempts made by the worker. Missing means 0. */
  attempts?: number;
  /** Last failed enrich attempt timestamp. */
  lastAttemptAt?: string;
  /** Truncated worker/enrich error from the last failed attempt. */
  lastError?: string;
  /** Set by the worker when the payload moves to `queue:drop-a-repo:dead`. */
  deadLetteredAt?: string;
}

/**
 * LPUSH a fresh drop onto the queue. The Redis client interface only
 * promises `lpush` when the underlying adapter implements it; both the
 * ioredis (Railway) and Upstash REST paths do. On a Redis-disabled
 * environment (no REDIS_URL, no UPSTASH_REDIS_REST_URL), this is a noop
 * with a warning — the submission is still persisted to the data-store so
 * an operator can manually drain.
 */
export async function enqueueDrop(payload: DropQueuePayload): Promise<{
  ok: boolean;
  queueDepth: number | null;
}> {
  const store = getDataStore();
  const client = store.redisClient();
  if (!client || !client.lpush) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[repo-intake-queue] Redis not available — drop not enqueued. " +
          "Set REDIS_URL or UPSTASH_REDIS_REST_URL+TOKEN to activate the queue.",
      );
    }
    return { ok: false, queueDepth: null };
  }

  const value = JSON.stringify(payload);
  try {
    const depth = await client.lpush(QUEUE_KEY, value);
    return { ok: true, queueDepth: depth };
  } catch (err) {
    // Log loudly — a failure here means the worker won't pick up the drop.
    // The submission is already persisted; an operator can drain manually.
    console.error("[repo-intake-queue] lpush failed:", err);
    return { ok: false, queueDepth: null };
  }
}

const DEEP_ENRICH_QUEUE_KEY = "queue:drop-deep-enrich";

export interface DeepEnrichQueuePayload {
  /** Submission record id. */
  submissionId: string;
  /** Repo full name (`owner/name`). */
  fullName: string;
  /** Wall-clock when the producer LPUSHed. */
  enqueuedAt: string;
}

/**
 * LPUSH a deep-enrich job after a drop is listed. The worker
 * `drop-deep-enrich-drain` RPOPs it and builds the community profile + LLM
 * editorial overview for that one repo NOW (instead of waiting for the daily
 * sweep). Best-effort: a Redis miss is a silent noop — the normal cadence
 * still enriches the repo, so this is an accelerator, not a critical path.
 */
export async function enqueueDeepEnrich(
  payload: DeepEnrichQueuePayload,
): Promise<{ ok: boolean; queueDepth: number | null }> {
  const store = getDataStore();
  const client = store.redisClient();
  if (!client || !client.lpush) {
    return { ok: false, queueDepth: null };
  }
  try {
    const depth = await client.lpush(
      DEEP_ENRICH_QUEUE_KEY,
      JSON.stringify(payload),
    );
    return { ok: true, queueDepth: depth };
  } catch (err) {
    console.error("[repo-intake-queue] deep-enrich lpush failed:", err);
    return { ok: false, queueDepth: null };
  }
}

const TWITTER_SCAN_QUEUE_KEY = "queue:drop-twitter";

export interface TwitterScanQueuePayload {
  /** Repo full name (`owner/name`). */
  fullName: string;
  /** Wall-clock when the producer LPUSHed. */
  enqueuedAt: string;
  /** Producer attribution. */
  source: string;
  /** Number of failed scan attempts made by the worker. Missing means 0. */
  attempts?: number;
  /** Last failed scan attempt timestamp. */
  lastAttemptAt?: string;
  /** Truncated worker error from the last failed attempt. */
  lastError?: string;
  /** Set by the worker when the payload moves to `queue:drop-twitter:dead`. */
  deadLetteredAt?: string;
}

/**
 * LPUSH an on-demand twitter scan job. The worker `drop-twitter-drain`
 * RPOPs it, runs ONE camofox→nitter scan for that repo, and SADDs the new
 * tweet IDs into the cumulative `ss:mentions:v1:<repo>:twitter` ledger.
 * Pickup latency ~60s + scan ~5–10s, so a newly-dropped repo has its first
 * twitter mention count visible within ~1–2 minutes.
 *
 * Best-effort: a Redis miss is a silent noop (the hourly twitter fetcher
 * will eventually pick the repo up when it rotates into the top-50 set).
 */
export async function enqueueTwitterScan(
  payload: TwitterScanQueuePayload,
): Promise<{ ok: boolean; queueDepth: number | null }> {
  const store = getDataStore();
  const client = store.redisClient();
  if (!client || !client.lpush) {
    return { ok: false, queueDepth: null };
  }
  try {
    const depth = await client.lpush(
      TWITTER_SCAN_QUEUE_KEY,
      JSON.stringify(payload),
    );
    return { ok: true, queueDepth: depth };
  } catch (err) {
    console.error("[repo-intake-queue] twitter-scan lpush failed:", err);
    return { ok: false, queueDepth: null };
  }
}

/** Read the current queue depth (LLEN). Returns null on Redis miss. */
export async function peekQueueDepth(): Promise<number | null> {
  const store = getDataStore();
  const client = store.redisClient();
  if (!client || !client.llen) return null;
  try {
    return await client.llen(QUEUE_KEY);
  } catch {
    return null;
  }
}

/** Read up to N most-recent enqueued payloads without consuming them. */
export async function peekQueue(
  count = 10,
): Promise<DropQueuePayload[]> {
  const store = getDataStore();
  const client = store.redisClient();
  if (!client || !client.lrange) return [];
  try {
    const raw = await client.lrange(QUEUE_KEY, 0, Math.max(0, count - 1));
    const out: DropQueuePayload[] = [];
    for (const entry of raw) {
      if (typeof entry !== "string") continue;
      try {
        const parsed = JSON.parse(entry) as DropQueuePayload;
        if (parsed && typeof parsed.submissionId === "string") {
          out.push(parsed);
        }
      } catch {
        // Skip malformed entries — never crash the live-queue view.
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Exposed for the worker drain — same key the producer LPUSHes to. */
export const DROP_QUEUE_KEY = QUEUE_KEY;
