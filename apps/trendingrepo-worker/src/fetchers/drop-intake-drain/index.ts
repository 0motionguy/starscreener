// drop-intake-drain — DORP queue consumer.
//
// PROBLEM
//   The /drop page (DORP) needs to ack new submissions within ~100ms.
//   Running the existing intake pipeline inline in the web POST handler
//   takes 5-30s and risks burning the GitHub PAT pool under burst load.
//
// SOLUTION
//   The web POST handler LPUSHes a payload onto `queue:drop-a-repo` and
//   returns immediately. This fetcher runs every minute, RPOPs up to
//   MAX_PER_TICK items, and for each one calls back to the web
//   `/api/repo-submissions/[id]/enrich` endpoint to run the existing
//   pipeline ingest + the per-drop scan fan-out. Worst-case pickup
//   latency is one cron tick (~60s).
//
// FIFO ordering: producer LPUSH (left), consumer RPOP (right).
//
// Backpressure: drains up to MAX_PER_TICK per tick with bounded concurrency
// CONCURRENCY. If the queue is deeper than MAX_PER_TICK, the next tick
// picks up the rest. Observable via `llen` on the queue key.
//
// Failure isolation: a single bad submission can't kill the tick. Failed
// enrich calls are requeued with an incremented attempt counter, then moved
// to `queue:drop-a-repo:dead` after the final attempt.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { loadEnv } from '../../lib/env.js';

const QUEUE_KEY = 'queue:drop-a-repo';
const DEAD_LETTER_KEY = `${QUEUE_KEY}:dead`;
const MAX_PER_TICK = 20;
const CONCURRENCY = 4;
const ENRICH_TIMEOUT_MS = 90_000;
const MAX_ENRICH_ATTEMPTS = 3;

interface QueuePayload {
  submissionId: string;
  fullName: string;
  enqueuedAt: string;
  source: string;
  attempts?: number;
  lastAttemptAt?: string;
  lastError?: string;
  deadLetteredAt?: string;
}

function parsePayload(raw: string | null): QueuePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as QueuePayload;
    if (typeof parsed.submissionId !== 'string' || !parsed.submissionId) {
      return null;
    }
    if (typeof parsed.fullName !== 'string' || !parsed.fullName) {
      return null;
    }
    const attempts =
      typeof parsed.attempts === 'number' &&
      Number.isFinite(parsed.attempts) &&
      parsed.attempts > 0
        ? Math.floor(parsed.attempts)
        : 0;
    return { ...parsed, attempts };
  } catch {
    return null;
  }
}

function failureMessage(result: { status?: string; error?: string }): string {
  return result.status
    ? `status ${result.status}: ${result.error ?? 'enrich failed'}`
    : (result.error ?? 'enrich failed');
}

async function preserveFailedPayload(
  ctx: FetcherContext,
  item: QueuePayload,
  message: string,
): Promise<RunResult['errors']> {
  const attempts = (item.attempts ?? 0) + 1;
  const now = new Date().toISOString();
  const nextPayload: QueuePayload = {
    ...item,
    attempts,
    lastAttemptAt: now,
    lastError: message,
  };
  const deadLetter = attempts >= MAX_ENRICH_ATTEMPTS;
  const destination = deadLetter ? DEAD_LETTER_KEY : QUEUE_KEY;
  const payload = deadLetter
    ? { ...nextPayload, deadLetteredAt: now }
    : nextPayload;

  if (!ctx.redis.lpush) {
    return [{
      stage: deadLetter ? 'dead-letter' : 'requeue',
      message: 'redis adapter lacks lpush; failed payload was not preserved',
      itemSourceId: item.submissionId,
    }];
  }

  try {
    await ctx.redis.lpush(destination, JSON.stringify(payload));
    ctx.log.warn(
      { submissionId: item.submissionId, fullName: item.fullName, attempts, destination },
      deadLetter ? 'drop-intake-drain dead-lettered payload' : 'drop-intake-drain requeued payload',
    );
    return [];
  } catch (err) {
    return [{
      stage: deadLetter ? 'dead-letter' : 'requeue',
      message: err instanceof Error ? err.message : String(err),
      itemSourceId: item.submissionId,
    }];
  }
}

async function callEnrich(
  baseUrl: string,
  cronSecret: string,
  payload: QueuePayload,
  ctx: FetcherContext,
): Promise<{ ok: boolean; status?: string; error?: string }> {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/repo-submissions/${encodeURIComponent(payload.submissionId)}/enrich`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENRICH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cronSecret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ source: 'worker:drop-intake-drain' }),
      signal: controller.signal,
    });
    const bodyText = await res.text();
    if (!res.ok) {
      ctx.log.warn(
        { submissionId: payload.submissionId, fullName: payload.fullName, status: res.status, body: bodyText.slice(0, 400) },
        'drop-intake-drain enrich failed',
      );
      return { ok: false, status: String(res.status), error: bodyText.slice(0, 400) };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.log.warn(
      { submissionId: payload.submissionId, fullName: payload.fullName, message },
      'drop-intake-drain enrich threw',
    );
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

async function drainBatch(
  ctx: FetcherContext,
  items: QueuePayload[],
  baseUrl: string,
  cronSecret: string,
): Promise<{ ok: number; failed: number; errors: RunResult['errors'] }> {
  let ok = 0;
  let failed = 0;
  const errors: RunResult['errors'] = [];
  const queue = [...items];
  const workers: Promise<void>[] = [];

  const runOne = async (item: QueuePayload): Promise<void> => {
    const result = await callEnrich(baseUrl, cronSecret, item, ctx);
    if (result.ok) ok++;
    else {
      failed++;
      const message = failureMessage(result);
      errors.push({
        stage: 'enrich',
        message,
        itemSourceId: item.submissionId,
      });
      errors.push(...await preserveFailedPayload(ctx, item, message));
    }
  };

  for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) return;
          await runOne(next);
        }
      })(),
    );
  }

  await Promise.all(workers);
  return { ok, failed, errors };
}

const fetcher: Fetcher = {
  name: 'drop-intake-drain',
  schedule: '* * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const env = loadEnv();
    const baseUrl =
      process.env.TRENDINGREPO_BASE_URL?.trim() ||
      env.TRENDINGREPO_BASE_URL;
    const cronSecret = process.env.CRON_SECRET?.trim() || env.CRON_SECRET;
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('drop-intake-drain dry-run');
      return summary(startedAt, 0, 0, false, []);
    }

    if (!baseUrl || !cronSecret) {
      ctx.log.warn(
        { hasBaseUrl: Boolean(baseUrl), hasCronSecret: Boolean(cronSecret) },
        'drop-intake-drain missing CRON_SECRET or TRENDINGREPO_BASE_URL — skipping tick',
      );
      return summary(startedAt, 0, 0, false, [
        { stage: 'config', message: 'missing CRON_SECRET or TRENDINGREPO_BASE_URL' },
      ]);
    }

    if (!ctx.redis.rpop || !ctx.redis.llen || !ctx.redis.lpush) {
      ctx.log.warn(
        'drop-intake-drain — redis adapter does not implement rpop/llen/lpush',
      );
      return summary(startedAt, 0, 0, false, [
        { stage: 'config', message: 'redis adapter lacks rpop/llen/lpush' },
      ]);
    }

    let depth = 0;
    try {
      depth = (await ctx.redis.llen(QUEUE_KEY)) ?? 0;
    } catch (err) {
      ctx.log.warn({ message: (err as Error).message }, 'drop-intake-drain llen failed');
    }

    const drained: QueuePayload[] = [];
    for (let i = 0; i < MAX_PER_TICK; i++) {
      let raw: string | null = null;
      try {
        raw = await ctx.redis.rpop(QUEUE_KEY);
      } catch (err) {
        const message = (err as Error).message;
        errors.push({ stage: 'rpop', message });
        ctx.log.warn({ message }, 'drop-intake-drain rpop failed');
        break;
      }
      if (raw === null) break;
      const parsed = parsePayload(raw);
      if (!parsed) {
        errors.push({ stage: 'parse', message: 'malformed payload — dropped' });
        ctx.log.warn({ raw: raw.slice(0, 200) }, 'drop-intake-drain malformed payload');
        continue;
      }
      drained.push(parsed);
    }

    if (drained.length === 0) {
      ctx.log.debug({ depthBefore: depth }, 'drop-intake-drain — queue empty');
      return summary(startedAt, 0, 0, true, errors);
    }

    ctx.log.info(
      { drained: drained.length, depthBefore: depth },
      'drop-intake-drain — draining batch',
    );

    const { ok, failed, errors: enrichErrors } = await drainBatch(ctx, drained, baseUrl, cronSecret);
    errors.push(...enrichErrors);
    ctx.log.info(
      { ok, failed, depthBefore: depth, drainedCount: drained.length },
      'drop-intake-drain — batch complete',
    );

    return summary(startedAt, drained.length, ok, true, errors);
  },
};

function summary(
  startedAt: string,
  itemsSeen: number,
  itemsUpserted: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'drop-intake-drain',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen,
    itemsUpserted,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}

export default fetcher;
