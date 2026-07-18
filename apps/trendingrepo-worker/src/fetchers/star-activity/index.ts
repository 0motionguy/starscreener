// star-activity — daily forward-append of one cumulative star-count
// point per registry repo per UTC day.
//
// CONTEXT
// The legacy GitHub Action `refresh-star-activity.yml` runs the same
// logic from `scripts/append-star-activity.mjs` but seeds its repo list
// from `data/trending.json` (bundled file) — that misses registry-only
// (dropped) repos entirely. Result: every dropped-repo profile shows
// "Star history not yet available" because no append ever runs.
//
// This worker fetcher closes the gap by seeding from the registry. Same
// payload shape, same slug, same idempotent `appendToday` semantics.
// Both writers can co-exist — they hit different repo sets and merge by
// last-write-wins for any overlap (today's point gets overwritten with
// the latest count either way).
//
// Cost: 1 GH REST call per repo (cheap `/repos/{owner}/{name}` returns
// stargazers_count directly — no pagination). The 3000-row default matches
// the registry cap and remains below one authenticated core-rate window.
//
// SCHEDULE
//   Daily 04:17 UTC (`17 4 * * *`) — between the GH Action's 03:17 run
//   and the next morning's cross-source-sweep (06:00). Spread out from
//   the bursty :00 / :30 slots.
//
// Wave C1 — 2026-05-27 hardening overnight session.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { writeDynamicOutputMarker } from '../../lib/dynamic-output-marker.js';
import {
  parseRateLimitHeaders,
  pickGithubToken,
  quarantine,
  recordRateLimit,
} from '../../lib/util/github-token-pool.js';
import {
  rankedRegistryFullNames,
  type RegistryPayloadLite,
} from '../../lib/util/registry-candidates.js';

// --- env-tunable knobs -----------------------------------------------------

// Widened 2026-05-29: cover the FULL registry daily (not just a 50-repo
// tail) so every visible repo gets a fresh daily star point — the
// prerequisite for `star-activity-deltas` to compute real 24h/7d/30d for
// the whole homepage set (GitHub-direct velocity, OSS-Insight-independent).
// Cost is 1 cheap `/repos/{owner}/{name}` call per repo; at most 3000/day.
export const STAR_ACTIVITY_LIMIT = Math.max(
  1,
  Math.min(
    3000,
    Number.parseInt(process.env.STAR_ACTIVITY_LIMIT ?? '3000', 10) || 3000,
  ),
);
const CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 12_000;

// --- payload shape (mirrors src/lib/star-activity.ts) ---------------------

interface StarActivityPoint {
  d: string; // YYYY-MM-DD UTC bucket
  s: number; // cumulative stars at end of day
  delta: number;
}

export interface StarActivityPayload {
  repoId: string; // "owner/name"
  points: StarActivityPoint[];
  firstObservedAt: string;
  backfillSource: 'stargazer-api' | 'snapshot-only' | 'dual-ended';
  coversFirstStar: boolean;
  updatedAt: string;
}

// --- helpers ---------------------------------------------------------------

function payloadSlug(fullName: string): string {
  return `star-activity:${fullName.toLowerCase().replace('/', '__')}`;
}

function ghHeaders(token: string | undefined): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'starscreener-star-activity',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/**
 * Append (or replace) today's point on `payload`. Returns the updated
 * payload. Mirrors the semantics of scripts/append-star-activity.mjs so
 * both writers produce identical outputs.
 *
 * Pure (no IO).
 */
export function appendToday(
  payload: StarActivityPayload | null,
  fullName: string,
  currentStars: number,
  now: string = new Date().toISOString(),
): StarActivityPayload {
  const today = now.slice(0, 10);
  const points = Array.isArray(payload?.points) ? [...payload.points] : [];
  const last = points[points.length - 1];
  const prevStars = last?.s ?? 0;
  const delta = currentStars - prevStars;

  if (last && last.d === today) {
    // Idempotent — same-day re-run replaces the latest point.
    points[points.length - 1] = {
      d: today,
      s: currentStars,
      delta:
        points.length > 1
          ? currentStars - (points[points.length - 2]?.s ?? 0)
          : 0,
    };
  } else {
    points.push({ d: today, s: currentStars, delta });
  }

  return {
    repoId: fullName,
    points,
    firstObservedAt: payload?.firstObservedAt ?? now,
    backfillSource: payload?.backfillSource ?? 'snapshot-only',
    coversFirstStar: payload?.coversFirstStar ?? false,
    updatedAt: now,
  };
}

export async function fetchCurrentStars(fullName: string): Promise<number | null> {
  const token = pickGithubToken();
  if (!token) return null;
  try {
    const response = await fetch(`https://api.github.com/repos/${fullName}`, {
      headers: ghHeaders(token),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const rateLimit = parseRateLimitHeaders(response.headers);
    if (rateLimit) {
      recordRateLimit(token, rateLimit.remaining, rateLimit.resetUnixSec);
    }
    if (response.status === 401) quarantine(token);
    if (!response.ok) return null;
    const data = (await response.json()) as { stargazers_count?: number };
    if (typeof data.stargazers_count !== 'number') return null;
    return data.stargazers_count;
  } catch {
    return null;
  }
}

async function appendOne(
  fullName: string,
): Promise<'updated' | 'skipped'> {
  const slug = payloadSlug(fullName);
  const existing = await readDataStore<StarActivityPayload>(slug).catch(() => null);
  const stars = await fetchCurrentStars(fullName);
  if (stars === null) return 'skipped';
  const next = appendToday(existing, fullName, stars);
  await writeDataStore(slug, next, { writer: 'star-activity' });
  return 'updated';
}

// --- fetcher --------------------------------------------------------------

const fetcher: Fetcher = {
  name: 'star-activity',
  // Daily 04:17 UTC — after the GH Action's 03:17 (same daily cycle but
  // separated by an hour so the chance of overlap is zero).
  schedule: '17 4 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('star-activity dry-run');
      return done(startedAt, 0, false, errors);
    }

    const token = pickGithubToken() ?? undefined;
    if (!token) {
      ctx.log.warn(
        'star-activity: no GitHub token in pool — skipping run (would all 401)',
      );
      return done(startedAt, 0, false, errors);
    }

    const registry = await readDataStore<RegistryPayloadLite>('repo-registry').catch(
      () => null,
    );
    // Full-registry coverage: STAR_ACTIVITY_LIMIT matches the registry cap,
    // so this snapshots EVERY registry
    // repo daily, not just the dropped tail — so `star-activity-deltas` has a
    // fresh latest point for the whole homepage set. Oldest-first ordering is
    // retained so that if the registry ever grows past the limit, the
    // longest-unseen repos are prioritised.
    const candidates = rankedRegistryFullNames(
      registry,
      STAR_ACTIVITY_LIMIT,
      'asc',
    );
    if (candidates.length === 0) {
      ctx.log.warn('star-activity: no registry candidates available');
      return done(startedAt, 0, false, errors);
    }

    let updated = 0;
    let skipped = 0;

    const queue = [...candidates];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const fullName = queue.shift();
        if (!fullName) break;
        try {
          const result = await appendOne(fullName);
          if (result === 'updated') updated += 1;
          else skipped += 1;
        } catch (err) {
          skipped += 1;
          errors.push({
            stage: `repo:${fullName}`,
            message: (err as Error).message ?? String(err),
          });
        }
      }
    });
    await Promise.all(workers);

    ctx.log.info(
      {
        candidates: candidates.length,
        updated,
        skipped,
        registryRepos: Object.keys(registry?.repos ?? {}).length,
      },
      'star-activity published',
    );

    const markerPublished = await writeDynamicOutputMarker({
      fetcher: 'star-activity',
      outputPattern: 'star-activity:<owner>__<name>',
      startedAt,
      candidates: candidates.length,
      updated,
      skipped,
      failed: errors.length,
    }).catch((err) => {
      errors.push({
        stage: 'write:worker-health:star-activity',
        message: (err as Error).message ?? String(err),
      });
      return false;
    });

    return done(startedAt, updated, markerPublished, errors);
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
    fetcher: 'star-activity',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
