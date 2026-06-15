// video-mentions — YouTube-v1 mention counter for the top-200 repos.
//
// WHY THIS EXISTS (Tier B.3 — TrendShift multi-platform parity)
// TrendShift's /live-mentions widget tracks mention velocity across X, Reddit,
// HN, Bilibili, and XiaoHongShu. We already cover X (twitter-warm/cold/hot),
// Reddit (paused), HN (hackernews) and add YouTube here for v1. Bilibili and
// XiaoHongShu are v2 — no Chinese-platform crawler in v1, documented in the
// PR body as known gap, not a TODO comment in the fetcher.
//
// METHOD
// Calls the YouTube Data API v3 Search:list endpoint with
//   part=snippet, q=<repo fullName>, type=video, publishedAfter=<now - 7d>,
//   maxResults=50
// for the top-N repos (default top-100 per hourly run), and stores
// `pageInfo.totalResults` as the 7-day mention count plus the first 5 snippet
// items as `topVideos[]`. Rotates through the full top-200 every 2 hours via
// a Redis-backed cursor (`ss:video-mentions:cursor`).
//
// QUOTA HONESTY
// Search:list costs 100 quota units per call against the API key. The free
// tier ships a daily 10,000-unit quota → 100 search calls/day max. The default
// fetcher cap of 100 repos/hour × 24 hourly runs = 2,400 calls/day, which is
// 24× the free quota. Operator MUST either:
//   1. Request a quota bump via Google Cloud Console for the API key, OR
//   2. Set YOUTUBE_MAX_REPOS_PER_RUN to a number that fits (e.g. 4 → 96/day).
// The fetcher does no quota accounting itself — it stops the run on the first
// `YouTubeQuotaExceededError` to avoid burning whatever quota remains.
//
// NEW-FETCHER POLICY HARD RULE (per the ULTRA plan)
// Payload includes `staleness_seconds`. Consumers MUST treat the payload as
// missing once `now - computedAt > staleness_seconds`. UI integration is a
// follow-up PR — this PR only ships the fetcher + redis publish.
//
// FALLBACK
// Missing YOUTUBE_API_KEY → no-op tick, warn-level log. Same for missing
// consensus-trending payload (no top-200 to iterate). No retries are added
// beyond AbortSignal.timeout — YouTube's API is fast and stable; transient
// failure on one repo just means the prior entry stays in the payload until
// the next sweep refreshes it.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { shouldPreserveCache } from '../../lib/util/cache-merge.js';
import { loadEnv } from '../../lib/env.js';
import {
  searchVideos,
  sevenDaysAgo,
  YouTubeApiError,
  YouTubeQuotaExceededError,
} from './youtube-client.js';
import {
  VIDEO_MENTIONS_CURSOR_KEY,
  VIDEO_MENTIONS_DEFAULT_STALENESS_SECONDS,
  VIDEO_MENTIONS_SLUG,
  type VideoMentionsEntry,
  type VideoMentionsPayload,
} from './types.js';

// --- knobs -----------------------------------------------------------------

const TOP_TIER_SIZE = 200;
const DEFAULT_REPOS_PER_RUN = 100;

function clampEnv(name: string, def: number, lo: number, hi: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  const v = Number.isFinite(n) && n > 0 ? n : def;
  return Math.max(lo, Math.min(hi, v));
}

// Capped at TOP_TIER_SIZE on the high end — a single run covering >200 makes
// the cursor math pointless. Floor of 1 lets operators tune all the way down
// for the free-tier 100-quota path described in the QUOTA HONESTY block.
const REPOS_PER_RUN = clampEnv(
  'YOUTUBE_MAX_REPOS_PER_RUN',
  DEFAULT_REPOS_PER_RUN,
  1,
  TOP_TIER_SIZE,
);

// Conservative — YouTube's quota is per-project-per-day, not per-second. The
// rate-limit risk is total daily usage, not burst. Keep concurrency low so we
// don't hammer the API and to surface quotaExceeded fast on a depleted key.
const CONCURRENCY = 2;

// --- consensus-trending source -------------------------------------------

interface ConsensusItemLite {
  fullName?: string;
  rank?: number;
}
interface ConsensusTrendingPayloadLite {
  items?: ConsensusItemLite[];
}

/**
 * Read the top-N fullNames from the `consensus-trending` payload, ordered by
 * rank ascending. Filters out malformed rows and slices to the tier size.
 * Pure.
 */
export function topTierFullNames(
  payload: ConsensusTrendingPayloadLite | null | undefined,
  tierSize: number = TOP_TIER_SIZE,
): string[] {
  const items = Array.isArray(payload?.items) ? payload!.items : [];
  const out: string[] = [];
  for (const item of items) {
    const fn = typeof item?.fullName === 'string' ? item.fullName.trim() : '';
    if (fn && fn.includes('/')) out.push(fn);
    if (out.length >= tierSize) break;
  }
  return out;
}

/**
 * Slice the top-200 list at the current cursor position, taking up to
 * `reposPerRun` repos and wrapping around the end. Returns the picked slice
 * plus the next cursor (which wraps mod TOP_TIER_SIZE).
 * Pure.
 */
export function pickRunSlice(
  topTier: string[],
  cursor: number,
  reposPerRun: number,
): { picked: string[]; nextCursor: number } {
  if (topTier.length === 0) {
    return { picked: [], nextCursor: 0 };
  }
  const effectiveTierSize = Math.min(TOP_TIER_SIZE, topTier.length);
  const safeCursor = ((cursor % effectiveTierSize) + effectiveTierSize) % effectiveTierSize;
  const safeReposPerRun = Math.max(1, Math.min(reposPerRun, effectiveTierSize));
  const picked: string[] = [];
  for (let i = 0; i < safeReposPerRun; i++) {
    picked.push(topTier[(safeCursor + i) % effectiveTierSize]!);
  }
  const nextCursor = (safeCursor + safeReposPerRun) % effectiveTierSize;
  return { picked, nextCursor };
}

/**
 * Overlay fresh entries onto the prior payload (fresh wins) — preserves
 * entries for repos not in this run's slice so the full top-200 is always
 * represented after the first 2-hour sweep.
 * Pure.
 */
export function mergeItems(
  existing: Record<string, VideoMentionsEntry>,
  fresh: Record<string, VideoMentionsEntry>,
): Record<string, VideoMentionsEntry> {
  return { ...existing, ...fresh };
}

// --- fetcher --------------------------------------------------------------

const fetcher: Fetcher = {
  name: 'video-mentions',
  // Hourly at :00 — paired with the cursor (100/run, cycle = 2h).
  schedule: '0 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('video-mentions dry-run');
      return done(startedAt, 0, false, errors);
    }

    const env = loadEnv();
    const apiKey = env.YOUTUBE_API_KEY;
    if (!apiKey) {
      ctx.log.warn('video-mentions: YOUTUBE_API_KEY not set, skipping tick');
      return done(startedAt, 0, false, errors);
    }

    const consensus = await readDataStore<ConsensusTrendingPayloadLite>(
      'consensus-trending',
    ).catch(() => null);
    const topTier = topTierFullNames(consensus);
    if (topTier.length === 0) {
      ctx.log.warn(
        'video-mentions: consensus-trending empty/missing, skipping tick',
      );
      return done(startedAt, 0, false, errors);
    }

    // Read cursor — bare-integer ASCII so we can rotate independently of the
    // payload's own cursor field (the payload is reset on TTL).
    let cursor = 0;
    try {
      const raw = (await ctx.redis.get(VIDEO_MENTIONS_CURSOR_KEY)) ?? '0';
      const parsed = Number.parseInt(String(raw), 10);
      if (Number.isFinite(parsed) && parsed >= 0) cursor = parsed;
    } catch (err) {
      ctx.log.warn(
        { err: (err as Error).message },
        'video-mentions: cursor read failed, defaulting to 0',
      );
    }

    const { picked, nextCursor } = pickRunSlice(topTier, cursor, REPOS_PER_RUN);
    if (picked.length === 0) {
      ctx.log.warn('video-mentions: pickRunSlice returned 0 repos');
      return done(startedAt, 0, false, errors);
    }

    const publishedAfter = sevenDaysAgo();
    const fresh: Record<string, VideoMentionsEntry> = {};
    let scanned = 0;
    let failed = 0;
    let quotaHit = false;

    const queue = [...picked];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0 && !quotaHit) {
        const fullName = queue.shift();
        if (!fullName) break;
        try {
          const result = await searchVideos({
            query: fullName,
            apiKey,
            publishedAfter,
          });
          fresh[fullName.toLowerCase()] = {
            count7d: result.totalResults,
            topVideos: result.topVideos,
            fetchedAt: new Date().toISOString(),
          };
          scanned += 1;
        } catch (err) {
          failed += 1;
          if (err instanceof YouTubeQuotaExceededError) {
            quotaHit = true;
            errors.push({
              stage: `quota:${fullName}`,
              message: err.message,
            });
            // Drain the queue so other workers stop cleanly.
            queue.length = 0;
            break;
          }
          if (err instanceof YouTubeApiError) {
            errors.push({
              stage: `api:${fullName}`,
              message: `status=${err.status} ${err.message}`,
            });
          } else {
            errors.push({
              stage: `repo:${fullName}`,
              message: (err as Error).message ?? String(err),
            });
          }
        }
      }
    });
    await Promise.all(workers);

    if (quotaHit) {
      ctx.log.error(
        { scanned, failed, queueRemaining: queue.length },
        'video-mentions: YouTube quota exceeded — stopping run, preserving cursor',
      );
      // Do NOT advance the cursor on quota-hit — re-run from same offset next
      // tick (likely after quota reset at midnight Pacific Time).
    } else {
      try {
        await ctx.redis.set(VIDEO_MENTIONS_CURSOR_KEY, String(nextCursor));
      } catch (err) {
        ctx.log.warn(
          { err: (err as Error).message },
          'video-mentions: cursor write failed',
        );
      }
    }

    // Merge fresh entries onto whatever the prior sweep wrote, so the full
    // top-200 stays represented after the first 2h cycle.
    const prior = await readDataStore<VideoMentionsPayload>(
      VIDEO_MENTIONS_SLUG,
    ).catch(() => null);
    const priorItems = prior?.items ?? {};
    const freshEntries = Object.values(fresh);

    // Zero-write guard — never replace a populated payload with an empty
    // recompute (same hazard class as star-activity-deltas zero-write guard).
    if (shouldPreserveCache({ fresh: freshEntries, existing: Object.values(priorItems) })) {
      ctx.log.warn(
        {
          picked: picked.length,
          priorItems: Object.keys(priorItems).length,
          failed,
        },
        'video-mentions: empty recompute — preserving prior slug',
      );
      return done(startedAt, 0, false, errors);
    }

    const mergedItems = mergeItems(priorItems, fresh);
    const payload: VideoMentionsPayload = {
      computedAt: new Date().toISOString(),
      staleness_seconds: VIDEO_MENTIONS_DEFAULT_STALENESS_SECONDS,
      cursor: quotaHit ? cursor : nextCursor,
      scanned,
      failed,
      items: mergedItems,
    };
    const result = await writeDataStore(VIDEO_MENTIONS_SLUG, payload, {
      writer: 'video-mentions',
    });
    ctx.log.info(
      {
        picked: picked.length,
        scanned,
        failed,
        totalItems: Object.keys(mergedItems).length,
        cursor,
        nextCursor: quotaHit ? cursor : nextCursor,
        quotaHit,
        redisSource: result.source,
      },
      'video-mentions published',
    );

    return done(startedAt, scanned, result.source === 'redis', errors);
  },
};

export default fetcher;

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'video-mentions',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
