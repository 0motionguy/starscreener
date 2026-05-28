// drop-deep-enrich-drain — second-stage enrichment for freshly-dropped repos.
//
// After a /drop submission is listed (src/lib/repo-intake.ts), the app LPUSHes
// `queue:drop-deep-enrich`. This fetcher runs every minute, RPOPs up to
// MAX_PER_TICK items, and for each one builds the deep profile NOW instead of
// waiting for the next daily community-profile sweep:
//   1. community profile (license, languages, README, owner org, commit graph)
//   2. an LLM-written editorial overview (citation-ready prose for GEO/AI search)
//
// Consensus verdict is intentionally NOT synthesized here. A brand-new repo has
// no cross-source signal yet, so a fabricated ConsensusItem would only yield a
// "weak/noise" verdict. The repo earns a REAL verdict once it accrues signal and
// enters consensus-trending on the normal hourly sweep (consensus-analyst).
//
// Best-effort: a failed item is logged and dropped (NOT requeued). The normal
// community-profile (:33) sweep covers the repo regardless, so deep-enrich is a
// "do it now" accelerator, not a critical path. FIFO: producer LPUSH, RPOP here.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';
import { pickGithubToken } from '../../lib/util/github-token-pool.js';
import { fetchProfile, payloadSlug } from '../repo-community-profile/index.js';
import { runRepoEditorial, repoEditorialSlug } from './editorial.js';

const QUEUE_KEY = 'queue:drop-deep-enrich';
const MAX_PER_TICK = 10;
// LLM-bound; keep concurrency low so a burst of drops can't stampede the Kimi
// subscription's concurrency cap (matches the consensus-analyst posture).
const CONCURRENCY = 2;
const COMMUNITY_TTL_SECONDS = 24 * 60 * 60;
const EDITORIAL_TTL_SECONDS = 7 * 24 * 60 * 60;

interface QueuePayload {
  submissionId: string;
  fullName: string;
  enqueuedAt: string;
}

function parsePayload(raw: string | null): QueuePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as QueuePayload;
    if (typeof parsed.fullName !== 'string' || !parsed.fullName.includes('/')) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function enrichOne(
  ctx: FetcherContext,
  fullName: string,
): Promise<{ community: boolean; editorial: boolean }> {
  const token = pickGithubToken() ?? undefined;
  let community = false;
  let editorial = false;

  // 1. Community profile — fills the RepoOwnerRepoSnapshot card. Skip the write
  // when fetchProfile returns null (anchor repo 401/403/404) so an existing
  // slug is never clobbered with empty (keep-last discipline).
  let profile: Awaited<ReturnType<typeof fetchProfile>> = null;
  try {
    profile = await fetchProfile(ctx, fullName, token);
    if (profile) {
      await writeDataStore(payloadSlug(fullName), profile, {
        ttlSeconds: COMMUNITY_TTL_SECONDS,
        writer: 'drop-deep-enrich-drain',
      });
      community = true;
    }
  } catch (err) {
    ctx.log.warn(
      { fullName, err: err instanceof Error ? err.message : String(err) },
      'drop-deep-enrich: community fetch failed',
    );
  }

  // 2. Editorial overview — grounded in the profile we just fetched. Skips the
  // write internally when the LLM is unconfigured / call fails / schema invalid.
  try {
    const ed = await runRepoEditorial(ctx, fullName, profile);
    if (ed) {
      await writeDataStore(repoEditorialSlug(fullName), ed, {
        ttlSeconds: EDITORIAL_TTL_SECONDS,
        writer: 'drop-deep-enrich-drain',
      });
      editorial = true;
    }
  } catch (err) {
    ctx.log.warn(
      { fullName, err: err instanceof Error ? err.message : String(err) },
      'drop-deep-enrich: editorial failed',
    );
  }

  return { community, editorial };
}

const fetcher: Fetcher = {
  name: 'drop-deep-enrich-drain',
  schedule: '* * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('drop-deep-enrich-drain dry-run');
      return summary(startedAt, 0, 0, false, errors);
    }

    if (!ctx.redis.rpop || !ctx.redis.llen) {
      ctx.log.warn('drop-deep-enrich-drain — redis adapter lacks rpop/llen');
      return summary(startedAt, 0, 0, false, [
        { stage: 'config', message: 'redis adapter lacks rpop/llen' },
      ]);
    }

    let depth = 0;
    try {
      depth = (await ctx.redis.llen(QUEUE_KEY)) ?? 0;
    } catch (err) {
      ctx.log.warn({ message: (err as Error).message }, 'drop-deep-enrich-drain llen failed');
    }

    const drained: QueuePayload[] = [];
    for (let i = 0; i < MAX_PER_TICK; i++) {
      let raw: string | null = null;
      try {
        raw = await ctx.redis.rpop(QUEUE_KEY);
      } catch (err) {
        errors.push({ stage: 'rpop', message: (err as Error).message });
        break;
      }
      if (raw === null) break;
      const parsed = parsePayload(raw);
      if (!parsed) {
        errors.push({ stage: 'parse', message: 'malformed payload — dropped' });
        continue;
      }
      drained.push(parsed);
    }

    if (drained.length === 0) {
      ctx.log.debug({ depthBefore: depth }, 'drop-deep-enrich-drain — queue empty');
      return summary(startedAt, 0, 0, true, errors);
    }

    ctx.log.info(
      { drained: drained.length, depthBefore: depth },
      'drop-deep-enrich-drain — draining batch',
    );

    let ok = 0;
    const queue = [...drained];
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, queue.length) },
      async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) return;
          const res = await enrichOne(ctx, item.fullName);
          if (res.community || res.editorial) ok += 1;
          else
            errors.push({
              stage: 'enrich',
              message: 'no community or editorial produced',
              itemSourceId: item.submissionId,
            });
        }
      },
    );
    await Promise.all(workers);

    ctx.log.info(
      { ok, drainedCount: drained.length, depthBefore: depth },
      'drop-deep-enrich-drain — batch complete',
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
    fetcher: 'drop-deep-enrich-drain',
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
