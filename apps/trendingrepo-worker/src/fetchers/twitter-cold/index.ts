// twitter-cold — daily registry-tail twitter sweep.
//
// PROBLEM
//   Hot+warm together cover ranks 1..500 by 24h velocity (50 hourly +
//   ~113 every 6h). Repos ranked 501..n by velocity (the "cold" tail —
//   ~1,000+ registry entries) get scanned only when they pop into the
//   warm tier, which may never happen for low-momentum repos.
//
// SOLUTION
//   Daily at 03:33 UTC (off-peak, after star-activity at 04:17 the prior
//   day so deltas are fresh), walk the cold tail alphabetically with a
//   Redis cursor. Scan REPOS_PER_RUN per tick. Full pass over ~1,000
//   cold repos completes in ~7 days. Profiles always have SOME freshness
//   on a configurable upper-bound.
//
// Cold-tier definition (in _picker.ts):
//   Tail = registry repos NOT in the top hotWarmBudget (500) of velocity,
//   sorted by fullName case-insensitive ASC for cursor stability.
//
// Same SADD-into-ledger pattern as warm. The slug twitter-repo-signals
// is OWNED by the hot tier; cold writes only the ledger.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import {
  applyLedger,
  buildRedisOps,
  mergeLedgerSnapshot,
  type LedgerWorkItem,
} from '../mentions-ledger/index.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { pickColdRepos } from '../twitter/_picker.js';
import { scanRepoBatchParallel } from '../twitter/_scan.js';
import { resolveNitterChain } from '../twitter/index.js';

const CURSOR_KEY = 'ss:twitter-cold:cursor';
const REPOS_PER_RUN = 150;
const HOT_WARM_BUDGET = 500;
// H7: same N=4 parallel-tabs setup as warm.
const CONCURRENCY = 4;

interface LedgerSnapshot {
  entries: Array<{
    fullName: string;
    perSource: Record<string, number>;
    total: number;
    sources: string[];
  }>;
  writtenAt: string;
}

const fetcher: Fetcher = {
  name: 'twitter-cold',
  // Daily at 03:33 UTC — quietest slot. Star-activity runs at 04:17 the
  // PRIOR cycle, deltas at 05:30 — so deltas are 22h fresh when we run.
  schedule: '33 3 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('twitter-cold dry-run');
      return summary(startedAt, 0, 0, false, []);
    }

    if (process.env.TWITTER_USE_CAMOFOX !== '1') {
      ctx.log.warn('twitter-cold — TWITTER_USE_CAMOFOX != 1, skipping tick');
      return summary(startedAt, 0, 0, false, []);
    }

    let cursor = 0;
    try {
      const raw = (await ctx.redis.get(CURSOR_KEY)) ?? '0';
      const parsed = Number.parseInt(String(raw), 10);
      if (Number.isFinite(parsed) && parsed >= 0) cursor = parsed;
    } catch (err) {
      ctx.log.warn({ err: (err as Error).message }, 'twitter-cold: cursor read failed, defaulting to 0');
    }

    const picked = await pickColdRepos({
      limit: REPOS_PER_RUN,
      cursor,
      hotWarmBudget: HOT_WARM_BUDGET,
      log: ctx.log,
    });
    if (picked.repos.length === 0) {
      ctx.log.warn(
        { cursor, tailSize: picked.tailSize },
        'twitter-cold: picker returned 0 repos (empty tail or registry empty)',
      );
      return summary(startedAt, 0, 0, false, errors);
    }

    const instanceChain = resolveNitterChain({
      chainEnv: process.env.TWITTER_NITTER_CHAIN,
      singleEnv: process.env.TWITTER_NITTER_INSTANCE,
      useCamofox: true,
    });
    ctx.log.info(
      {
        cursor,
        tailSize: picked.tailSize,
        repos: picked.repos.length,
        nextCursor: picked.nextCursor,
        chainLen: instanceChain.length,
      },
      'twitter-cold: starting nitter sweep',
    );

    const scan = await scanRepoBatchParallel({
      repos: picked.repos,
      instanceChain,
      log: ctx.log,
      scanLabel: 'twitter-cold',
      concurrency: CONCURRENCY,
    });

    const byRepo: Record<string, string[]> = {};
    for (const post of scan.posts) {
      (byRepo[post.repoFullName] ??= []).push(post.id);
    }
    const workItems: LedgerWorkItem[] = Object.entries(byRepo).map(([repo, ids]) => ({
      repo,
      source: 'twitter',
      ids,
    }));

    let reposTouched = 0;
    let newMentions = 0;
    if (workItems.length > 0) {
      const ops = await buildRedisOps();
      if (!ops) {
        ctx.log.warn('twitter-cold: redis ops unavailable; ledger apply skipped');
        errors.push({ stage: 'apply', message: 'redis ops unavailable' });
      } else {
        try {
          const apply = await applyLedger(ops, workItems);
          reposTouched = apply.reposTouched;
          newMentions = apply.newMentions;
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
            'twitter-cold: ledger applied + snapshot merged',
          );
        } catch (err) {
          const message = (err as Error).message;
          errors.push({ stage: 'apply', message });
          ctx.log.error({ message }, 'twitter-cold: ledger apply failed');
        } finally {
          if (ops.quit) await ops.quit();
        }
      }
    }

    // Advance cursor for next run. Wrap via the picker's reported nextCursor.
    try {
      await ctx.redis.set(CURSOR_KEY, String(picked.nextCursor));
    } catch (err) {
      ctx.log.warn({ err: (err as Error).message }, 'twitter-cold: cursor write failed');
    }

    ctx.log.info(
      {
        cursor,
        nextCursor: picked.nextCursor,
        tailSize: picked.tailSize,
        scanned: scan.scannedRepos,
        failed: scan.failedRepos,
        posts: scan.posts.length,
        reposTouched,
        newMentions,
        retriesPerformed: scan.retriesPerformed,
        instanceRotations: scan.instanceRotations,
        finalInstance: scan.finalInstance,
      },
      'twitter-cold published',
    );

    return summary(startedAt, scan.scannedRepos, scan.posts.length, workItems.length > 0, errors);
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
    fetcher: 'twitter-cold',
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
