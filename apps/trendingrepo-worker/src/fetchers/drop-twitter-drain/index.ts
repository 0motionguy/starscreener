// drop-twitter-drain — on-demand twitter scan queue consumer.
//
// PROBLEM
//   The hourly `twitter` fetcher scans MAX_REPOS_PER_RUN=50 repos per tick
//   from the ~1.5k registry. A freshly-dropped repo waits ~31 hours on
//   average before it rotates into the top-50 set, during which its profile
//   shows "0 Twitter mentions" even though tweets about it might exist.
//
// SOLUTION
//   The web `/api/repo-submissions` POST handler LPUSHes `{fullName, ...}`
//   onto `queue:drop-twitter` whenever a new submission is created. This
//   fetcher runs every minute, RPOPs up to MAX_PER_TICK items, opens ONE
//   camofox tab per repo, and applies the projected tweet IDs directly into
//   the cumulative mentions ledger via the same `applyLedger` primitive the
//   regular mentions-ledger fetcher uses. Worst-case latency:
//     drop → 60s queue pickup → ~10s scan → ~instant SADD → profile reads
//     a positive twitter mention count within ~1-2 min.
//
// Why ledger-only (no slug write)?
//   `twitter-repo-signals` is the hourly fetcher's last-write-wins rolling
//   buffer. Writing into it from here races with the hourly tick (and would
//   be overwritten on the next replacement write). The user-visible
//   mention count lives in the ledger; that's where the drain writes.
//   The next `mentions-ledger` cron tick (every 15 min) recomputes the
//   snapshot from the index hash and the new counts surface on profiles.
//
// FIFO + backpressure: same shape as drop-intake-drain. LPUSH/RPOP, retry
// requeue, dead-letter on `queue:drop-twitter:dead` after MAX_ATTEMPTS.
//
// Concurrency: 1 (single camofox tab). H7 will lift this to N=4 once
// camofox has parallel-tab support + a worker-side concurrency limiter.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import {
  applyLedger,
  buildRedisOps,
  mergeLedgerSnapshot,
  type LedgerWorkItem,
  type RedisOps,
} from '../mentions-ledger/index.js';
import {
  buildNitterSearchUrl,
  closeCamofoxTab,
  createCamofoxTab,
  fetchViaCamofox,
  parseNitterSearchHtml,
  resolveNitterChain,
  shouldRetryAfterCamofoxError,
} from '../twitter/index.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';

const QUEUE_KEY = 'queue:drop-twitter';
const DEAD_LETTER_KEY = `${QUEUE_KEY}:dead`;
const MAX_PER_TICK = 3;
const MAX_ATTEMPTS = 3;

interface QueuePayload {
  fullName: string;
  enqueuedAt: string;
  source?: string;
  attempts?: number;
  lastAttemptAt?: string;
  lastError?: string;
  deadLetteredAt?: string;
}

export function parsePayload(raw: string | null): QueuePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as QueuePayload;
    if (typeof parsed.fullName !== 'string' || parsed.fullName.indexOf('/') < 0) {
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
    lastError: message.slice(0, 400),
  };
  const deadLetter = attempts >= MAX_ATTEMPTS;
  const destination = deadLetter ? DEAD_LETTER_KEY : QUEUE_KEY;
  const payload = deadLetter
    ? { ...nextPayload, deadLetteredAt: now }
    : nextPayload;

  if (!ctx.redis.lpush) {
    return [{
      stage: deadLetter ? 'dead-letter' : 'requeue',
      message: 'redis adapter lacks lpush; failed payload was not preserved',
      itemSourceId: item.fullName,
    }];
  }

  try {
    await ctx.redis.lpush(destination, JSON.stringify(payload));
    ctx.log.warn(
      { fullName: item.fullName, attempts, destination },
      deadLetter ? 'drop-twitter-drain dead-lettered payload' : 'drop-twitter-drain requeued payload',
    );
    return [];
  } catch (err) {
    return [{
      stage: deadLetter ? 'dead-letter' : 'requeue',
      message: err instanceof Error ? err.message : String(err),
      itemSourceId: item.fullName,
    }];
  }
}

interface ScanResult {
  ok: boolean;
  ids?: string[];
  error?: string;
}

async function scanOneRepo(opts: {
  tabId: string;
  instance: string;
  fullName: string;
}): Promise<ScanResult> {
  const { tabId, instance, fullName } = opts;
  const url = buildNitterSearchUrl(instance, fullName);
  const fetchedAt = new Date().toISOString();
  try {
    const html = await fetchViaCamofox(tabId, url);
    const posts = parseNitterSearchHtml(html, fullName, fetchedAt, url);
    return { ok: true, ids: posts.map((p) => p.id) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

interface LedgerSnapshot {
  entries: Array<{ fullName: string; perSource: Record<string, number>; total: number; sources: string[] }>;
  writtenAt: string;
}

const fetcher: Fetcher = {
  name: 'drop-twitter-drain',
  schedule: '* * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('drop-twitter-drain dry-run');
      return summary(startedAt, 0, 0, false, []);
    }

    // Gate on the camofox feature flag — same as the hourly twitter fetcher.
    // Without camofox we have no Anubis bypass and would just 403 every tab.
    if (process.env.TWITTER_USE_CAMOFOX !== '1') {
      ctx.log.debug('drop-twitter-drain — TWITTER_USE_CAMOFOX != 1, skipping tick');
      return summary(startedAt, 0, 0, false, []);
    }

    if (!ctx.redis.rpop || !ctx.redis.llen || !ctx.redis.lpush) {
      ctx.log.warn(
        'drop-twitter-drain — redis adapter does not implement rpop/llen/lpush',
      );
      return summary(startedAt, 0, 0, false, [
        { stage: 'config', message: 'redis adapter lacks rpop/llen/lpush' },
      ]);
    }

    let depth = 0;
    try {
      depth = (await ctx.redis.llen(QUEUE_KEY)) ?? 0;
    } catch (err) {
      ctx.log.warn({ message: (err as Error).message }, 'drop-twitter-drain llen failed');
    }

    const drained: QueuePayload[] = [];
    for (let i = 0; i < MAX_PER_TICK; i++) {
      let raw: string | null = null;
      try {
        raw = await ctx.redis.rpop(QUEUE_KEY);
      } catch (err) {
        const message = (err as Error).message;
        errors.push({ stage: 'rpop', message });
        ctx.log.warn({ message }, 'drop-twitter-drain rpop failed');
        break;
      }
      if (raw === null) break;
      const parsed = parsePayload(raw);
      if (!parsed) {
        errors.push({ stage: 'parse', message: 'malformed payload — dropped' });
        ctx.log.warn({ raw: raw.slice(0, 200) }, 'drop-twitter-drain malformed payload');
        continue;
      }
      drained.push(parsed);
    }

    if (drained.length === 0) {
      ctx.log.debug({ depthBefore: depth }, 'drop-twitter-drain — queue empty');
      return summary(startedAt, 0, 0, true, errors);
    }

    ctx.log.info(
      { drained: drained.length, depthBefore: depth },
      'drop-twitter-drain — draining batch',
    );

    // One camofox tab handles all repos in this tick (~3 max). Single tab
    // is cheap — H7 will parallelize.
    const instanceChain = resolveNitterChain({
      chainEnv: process.env.TWITTER_NITTER_CHAIN,
      singleEnv: process.env.TWITTER_NITTER_INSTANCE,
      useCamofox: true,
    });
    const instance = instanceChain[0] ?? 'https://nitter.privacyredirect.com';

    let tabId: string | undefined;
    try {
      tabId = await createCamofoxTab(`${instance}/`);
    } catch (err) {
      const message = (err as Error).message;
      ctx.log.error({ message, instance }, 'drop-twitter-drain — camofox tab create failed; requeueing batch');
      for (const item of drained) {
        errors.push(...await preserveFailedPayload(ctx, item, message));
      }
      return summary(startedAt, drained.length, 0, false, errors);
    }

    let okCount = 0;
    const workItems: LedgerWorkItem[] = [];
    let ops: RedisOps | null = null;
    try {
      for (const item of drained) {
        let result = await scanOneRepo({ tabId, instance, fullName: item.fullName });
        // H5-style one-shot retry on transient camofox 5xx.
        if (!result.ok && result.error && shouldRetryAfterCamofoxError(result.error)) {
          ctx.log.warn(
            { fullName: item.fullName, err: result.error },
            'drop-twitter-drain — nav 5xx, retrying with fresh tab',
          );
          try {
            await closeCamofoxTab(tabId);
          } catch {
            /* best-effort */
          }
          try {
            tabId = await createCamofoxTab(`${instance}/`);
            result = await scanOneRepo({ tabId, instance, fullName: item.fullName });
          } catch (err) {
            result = { ok: false, error: (err as Error).message };
          }
        }
        if (!result.ok) {
          const message = result.error ?? 'scan failed';
          errors.push({ stage: 'scan', message, itemSourceId: item.fullName });
          errors.push(...await preserveFailedPayload(ctx, item, message));
          continue;
        }
        const ids = result.ids ?? [];
        if (ids.length > 0) {
          workItems.push({ repo: item.fullName, source: 'twitter', ids });
        }
        okCount += 1;
        ctx.log.info(
          { fullName: item.fullName, tweetCount: ids.length },
          'drop-twitter-drain — repo scanned',
        );
      }
    } finally {
      if (tabId) {
        try {
          await closeCamofoxTab(tabId);
        } catch {
          /* best-effort */
        }
      }
    }

    // Apply projected work to the cumulative ledger and immediately fold
    // the per-repo entries into the mentions-ledger snapshot so profiles
    // see the new count without waiting for the next :7/:22/:37/:52 tick.
    if (workItems.length > 0) {
      ops = await buildRedisOps();
      if (!ops) {
        const message = 'redis ops unavailable for ledger apply';
        ctx.log.warn(message);
        errors.push({ stage: 'apply', message });
      } else {
        try {
          const apply = await applyLedger(ops, workItems);
          const existing = await readDataStore<LedgerSnapshot>('mentions-ledger').catch(() => null);
          const merged = mergeLedgerSnapshot(existing, apply.entries, new Date().toISOString());
          await writeDataStore('mentions-ledger', merged);
          ctx.log.info(
            {
              reposTouched: apply.reposTouched,
              newMentions: apply.newMentions,
              leaderboardSize: apply.leaderboardSize,
              snapshotEntries: merged.entries.length,
            },
            'drop-twitter-drain — ledger applied + snapshot merged',
          );
        } catch (err) {
          const message = (err as Error).message;
          errors.push({ stage: 'apply', message });
          ctx.log.error({ message }, 'drop-twitter-drain — ledger apply failed');
        } finally {
          if (ops.quit) await ops.quit();
        }
      }
    }

    ctx.log.info(
      { ok: okCount, failed: drained.length - okCount, depthBefore: depth, drainedCount: drained.length },
      'drop-twitter-drain — batch complete',
    );

    return summary(startedAt, drained.length, okCount, workItems.length > 0, errors);
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
    fetcher: 'drop-twitter-drain',
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
