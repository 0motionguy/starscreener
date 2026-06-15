// Phase 3.4 — GitHub Events 7-day rolling aggregator for engagement-composite.
//
// Closes the OSSInsight "10B+ GitHub events tracked since 2011" depth gap
// from the v3 deltas audit (impact 4.0 — see https://ossinsight.io). The
// existing `github-events` firehose keeps a per-repo buffer of normalized
// events for the live activity wall; this fetcher computes a *7-day rolling
// aggregate* per repo across PullRequest/Issues/Push/Release events. The
// aggregate is fed back into engagement-composite as a new `ghEvents`
// component with a small weight (0.05).
//
// Cohort: top-200 repos from `engagement-composite` (already TOP_LIMIT=200
// by spec). Falls back to `repo-metadata` if engagement-composite is cold
// on a fresh deploy.
//
// Rate-limit math: 200 calls per tick × 2 ticks/hr = 400/hr against the
// GH_TOKEN_POOL — 5K/hr per PAT × 10 PATs = 50K/hr capacity. 0.8% utilization.
// Headroom is generous so we don't need ETag caching to be in budget; we use
// it anyway because ctx.http.json handles it transparently.
//
// Cadence: '15,45 * * * *' — two ticks per hour, offset from velocity-refresh
// (typical :00,:30) and star-activity-deltas crons so we don't pile onto the
// same minute. Snapshot freshness is at most 30min; the engagement-composite
// read path drops this component for repos whose snapshot is older than 90min
// (no-publicly-stale-batches rule).
//
// Slug: `gh-events-stream`. Payload is ~6KB for 200 repos — well under the
// 50KB gzip threshold so it stays plaintext in Redis.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore, readDataStore } from '../../lib/redis.js';
import { pickGithubToken } from '../../lib/util/github-token-pool.js';
import { aggregateEvents, WINDOW_DAYS } from './filter.js';
import type { GhEventsStreamPayload, RepoEventCounts } from './types.js';

const GITHUB_API = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const PER_PAGE = 100;
const SLUG = 'gh-events-stream';

const COHORT_TARGET = Math.max(
  10,
  Math.min(
    500,
    Number.parseInt(process.env.GH_EVENTS_STREAM_COHORT ?? '200', 10) || 200,
  ),
);

// Match github-events' concurrency floor — 5 is comfortable for a single-
// core Railway box and a 200-repo batch finishes in ~2-3 min wall time.
const FETCH_CONCURRENCY = Math.max(
  1,
  Math.min(
    20,
    Number.parseInt(process.env.GH_EVENTS_STREAM_CONCURRENCY ?? '5', 10) || 5,
  ),
);

// ---- Upstream payload shapes (loose) --------------------------------------

interface EngagementCompositeItem {
  fullName?: string | null;
  rank?: number | null;
}
interface EngagementCompositePayload {
  items?: EngagementCompositeItem[];
}

interface RepoMetadataItem {
  fullName?: string | null;
  stars?: number | null;
}
interface RepoMetadataPayload {
  items?: RepoMetadataItem[];
}

// ---- Cohort selection -----------------------------------------------------

function isValidFullName(value: unknown): value is string {
  return typeof value === 'string' && value.includes('/') && value.trim().length > 2;
}

/**
 * Derive the top-N cohort. Priority chain:
 *   1. engagement-composite (already 1-based ranked, TOP_LIMIT=200)
 *   2. repo-metadata sorted by stars desc (cold-start fallback)
 *
 * Returns an empty array when both sources are empty — caller logs and skips.
 */
export function deriveCohort(
  engagement: EngagementCompositePayload | null,
  repoMetadata: RepoMetadataPayload | null,
  target: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const items = Array.isArray(engagement?.items) ? engagement.items : [];
  for (const item of items) {
    if (!isValidFullName(item?.fullName)) continue;
    const fn = item.fullName;
    const lower = fn.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(fn);
    if (out.length >= target) return out;
  }

  // Fallback: repo-metadata sorted by stars desc.
  const metaItems = Array.isArray(repoMetadata?.items) ? repoMetadata.items : [];
  const ranked = metaItems
    .filter((m): m is { fullName: string; stars: number } => {
      return (
        isValidFullName(m?.fullName) &&
        typeof m?.stars === 'number' &&
        Number.isFinite(m.stars)
      );
    })
    .sort((a, b) => b.stars - a.stars);
  for (const m of ranked) {
    const lower = m.fullName.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(m.fullName);
    if (out.length >= target) return out;
  }
  return out;
}

// ---- Per-repo polling -----------------------------------------------------

interface FetchResult {
  ok: boolean;
  counts?: RepoEventCounts;
  errorStage?: string;
  errorMessage?: string;
}

async function fetchOneRepo(
  ctx: FetcherContext,
  fullName: string,
  nowMs: number,
): Promise<FetchResult> {
  const token = pickGithubToken();
  if (!token) {
    return {
      ok: false,
      errorStage: `repo:${fullName}`,
      errorMessage: 'no GH PAT available (token pool empty)',
    };
  }

  const url = `${GITHUB_API}/repos/${fullName}/events?per_page=${PER_PAGE}`;

  try {
    // ctx.http.json transparently handles ETag caching: a 304 reply
    // replays the cached body from Redis. With 200 repos × 2 ticks/hr and
    // a 7d window, MOST ticks will see 304 on quiet repos — nice freebie.
    const { data } = await ctx.http.json<unknown>(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'starscreener-worker/gh-events-stream',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      timeoutMs: 20_000,
      maxRetries: 2,
    });
    return { ok: true, counts: aggregateEvents(data, nowMs) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      errorStage: `repo:${fullName}`,
      errorMessage: message,
    };
  }
}

async function pollCohort(
  ctx: FetcherContext,
  cohort: ReadonlyArray<string>,
  nowMs: number,
): Promise<FetchResult[]> {
  const results = new Array<FetchResult>(cohort.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < cohort.length) {
      const idx = cursor++;
      const fullName = cohort[idx];
      if (!fullName) continue;
      results[idx] = await fetchOneRepo(ctx, fullName, nowMs);
    }
  }

  const workers = Array.from(
    { length: Math.min(FETCH_CONCURRENCY, cohort.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

// ---- Fetcher entry point --------------------------------------------------

const fetcher: Fetcher = {
  name: 'gh-events-stream',
  // Twice an hour at :15 and :45 — offset from velocity-refresh (typical
  // :00,:30) and the engagement-composite hourly :45 (whose payload we
  // read; :45 is fine because we read what's already in Redis from the
  // previous hour's run — the new payload is published mid-tick).
  schedule: '15,45 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('gh-events-stream dry-run');
      return done(startedAt, 0, false, errors);
    }

    if (!pickGithubToken()) {
      const msg =
        'GH_TOKEN_POOL / GITHUB_TOKEN not configured — skipping gh-events-stream';
      ctx.log.warn(msg);
      return done(startedAt, 0, false, [{ stage: 'auth', message: msg }]);
    }

    // AUDIT-2026-05-04 pattern: allSettled so a single Redis flake degrades
    // to null instead of crashing the whole fetcher.
    const reads = await Promise.allSettled([
      readDataStore<EngagementCompositePayload>('engagement-composite'),
      readDataStore<RepoMetadataPayload>('repo-metadata'),
    ]);
    const engagement = reads[0].status === 'fulfilled' ? reads[0].value : null;
    const repoMetadata = reads[1].status === 'fulfilled' ? reads[1].value : null;
    if (reads.some((r) => r.status === 'rejected')) {
      ctx.log.warn(
        {
          engagement: reads[0].status === 'rejected' ? String(reads[0].reason) : null,
          repoMetadata: reads[1].status === 'rejected' ? String(reads[1].reason) : null,
        },
        '[gh-events-stream] upstream read failed; degrading to null',
      );
    }

    const cohort = deriveCohort(engagement, repoMetadata, COHORT_TARGET);
    if (cohort.length === 0) {
      const msg =
        'cohort empty — engagement-composite + repo-metadata both yielded no candidates';
      ctx.log.warn(msg);
      return done(startedAt, 0, false, [{ stage: 'cohort', message: msg }]);
    }

    const nowMs = Date.now();
    const results = await pollCohort(ctx, cohort, nowMs);

    const repos: GhEventsStreamPayload['repos'] = {};
    let errorCount = 0;
    for (let i = 0; i < results.length; i += 1) {
      const r = results[i]!;
      const fullName = cohort[i]!;
      if (!r.ok || !r.counts) {
        errorCount += 1;
        errors.push({
          stage: r.errorStage ?? `repo:${fullName}`,
          message: r.errorMessage ?? 'unknown failure',
        });
        continue;
      }
      // Only emit repos with at least one event in the window — keeps the
      // payload compact and lets the consumer treat "missing" as "no recent
      // contributor activity" without ambiguity.
      if (r.counts.events7d > 0) {
        repos[fullName] = r.counts;
      }
    }

    const computedAt = new Date().toISOString();
    // staleness_seconds is recorded at write time as a baseline; consumers
    // compute live staleness as (now - computedAt) and apply the 90-min
    // drop rule there. Writing 0 here keeps the field stable for tests.
    const payload: GhEventsStreamPayload = {
      computedAt,
      staleness_seconds: 0,
      cohortSize: cohort.length,
      windowDays: WINDOW_DAYS,
      repos,
      errorCount,
    };

    let redisOk = false;
    try {
      const wr = await writeDataStore(SLUG, payload);
      if (wr.source === 'redis') redisOk = true;
    } catch (err) {
      errors.push({
        stage: 'write',
        message: err instanceof Error ? err.message : String(err),
      });
    }

    ctx.log.info(
      {
        cohortSize: cohort.length,
        reposWithEvents: Object.keys(repos).length,
        errorCount,
        windowDays: WINDOW_DAYS,
      },
      'gh-events-stream published',
    );

    return done(startedAt, Object.keys(repos).length, redisOk, errors);
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
    fetcher: 'gh-events-stream',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
