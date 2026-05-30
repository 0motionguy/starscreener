// twitter-warm — 6-hourly mid-rank twitter sweep.
//
// PROBLEM
//   The hourly twitter fetcher only covers ranks 1..50 (top by velocity).
//   With ~1,576 registry repos, anything outside that top-50 waits ~31 h
//   on average to be scanned, even when it's currently active on Twitter.
//
// SOLUTION
//   This fetcher scans ranks 51..500 (the "warm" tier) on a 6h cadence,
//   covering 450 repos across 4 daily runs. Picks 150 repos per run via
//   a Redis-backed rotating cursor; full warm tier is covered every ~18 h
//   (450/150 × 6h between runs).
//
// Pickup latency contract:
//   - Hot     (ranks 1..50):   hourly        → max 1h to refresh
//   - Warm    (ranks 51..500): 6-hourly      → max 18-24h to refresh
//   - Cold    (ranks 501..n):  daily         → max ~7 days (cursor-paged)
//   - On-drop                                → ~60s (drop-twitter-drain)
//
// Writes go straight into the cumulative mentions ledger via applyLedger
// (same primitive the regular mentions-ledger fetcher uses). The slug
// `twitter-repo-signals` is OWNED by the hourly hot tier and is not
// touched here — the rolling buffer is a hot-tier concept; the ledger
// is the durable count.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import {
  applyLedger,
  buildRedisOps,
  mergeLedgerSnapshot,
  type LedgerWorkItem,
} from '../mentions-ledger/index.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { pickWarmRepos } from '../twitter/_picker.js';
import { scanRepoBatch } from '../twitter/_scan.js';
import { resolveNitterChain } from '../twitter/index.js';

const CURSOR_KEY = 'ss:twitter-warm:cursor';
const WARM_TIER_START = 51;
const WARM_TIER_SIZE = 450;
const REPOS_PER_RUN = 150;

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
  name: 'twitter-warm',
  // Every 6h at :07 (offset from hot tier at :19 so they don't both run at
  // top-of-hour). Buckets: 00:07, 06:07, 12:07, 18:07 UTC.
  schedule: '7 */6 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('twitter-warm dry-run');
      return summary(startedAt, 0, 0, false, []);
    }

    // Camofox-only (post-Anubis). Skip if the flag is off.
    if (process.env.TWITTER_USE_CAMOFOX !== '1') {
      ctx.log.warn('twitter-warm — TWITTER_USE_CAMOFOX != 1, skipping tick');
      return summary(startedAt, 0, 0, false, []);
    }

    // Read cursor (offset into the warm range). Defaults to 0.
    let cursor = 0;
    try {
      const raw = (await ctx.redis.get(CURSOR_KEY)) ?? '0';
      const parsed = Number.parseInt(String(raw), 10);
      if (Number.isFinite(parsed) && parsed >= 0) cursor = parsed % WARM_TIER_SIZE;
    } catch (err) {
      ctx.log.warn({ err: (err as Error).message }, 'twitter-warm: cursor read failed, defaulting to 0');
    }

    const startRank = WARM_TIER_START + cursor;
    const picked = await pickWarmRepos({ startRank, limit: REPOS_PER_RUN, log: ctx.log });
    if (picked.repos.length === 0) {
      ctx.log.warn(
        { startRank, cursor, tierSize: WARM_TIER_SIZE },
        'twitter-warm: picker returned 0 repos (deltas missing or tier exhausted)',
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
        rankWindow: picked.rankWindow,
        repos: picked.repos.length,
        chainLen: instanceChain.length,
      },
      'twitter-warm: starting nitter sweep',
    );

    const scan = await scanRepoBatch({
      repos: picked.repos,
      instanceChain,
      log: ctx.log,
      scanLabel: 'twitter-warm',
    });

    // Group posts by repoFullName and project into ledger work items.
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
        ctx.log.warn('twitter-warm: redis ops unavailable; ledger apply skipped');
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
            'twitter-warm: ledger applied + snapshot merged',
          );
        } catch (err) {
          const message = (err as Error).message;
          errors.push({ stage: 'apply', message });
          ctx.log.error({ message }, 'twitter-warm: ledger apply failed');
        } finally {
          if (ops.quit) await ops.quit();
        }
      }
    }

    // Advance cursor for next run. Wrap around the warm tier size.
    const nextCursor = (cursor + REPOS_PER_RUN) % WARM_TIER_SIZE;
    try {
      await ctx.redis.set(CURSOR_KEY, String(nextCursor));
    } catch (err) {
      ctx.log.warn({ err: (err as Error).message }, 'twitter-warm: cursor write failed');
    }

    ctx.log.info(
      {
        startRank: picked.rankWindow.from,
        endRank: picked.rankWindow.to,
        nextCursor,
        scanned: scan.scannedRepos,
        failed: scan.failedRepos,
        posts: scan.posts.length,
        reposTouched,
        newMentions,
        retriesPerformed: scan.retriesPerformed,
        instanceRotations: scan.instanceRotations,
        finalInstance: scan.finalInstance,
      },
      'twitter-warm published',
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
    fetcher: 'twitter-warm',
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
