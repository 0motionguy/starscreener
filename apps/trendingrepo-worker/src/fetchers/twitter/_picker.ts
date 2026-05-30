// Repo tier picker for the 3-tier twitter scanning system.
//
// Ranks come from `star-activity-deltas`, the worker's GitHub-direct 24h/7d/30d
// star-delta backbone (shipped 2026-05-29). The cumulative shape:
//   {
//     computedAt: ISO,
//     coverage: {exact: N, nearest: M, "cold-start": K, "no-history": L},
//     repos: { "<owner>/<name>": { stars_now, latest_d, delta_24h: {value,...}, delta_7d, delta_30d } }
//   }
//
// Three tiers, ordered by rank:
//   HOT  — ranks 1..50            (scanned hourly)
//   WARM — ranks 51..500          (scanned every 6h, 4 buckets of ~113)
//   COLD — registry-tail, not in top-500 (scanned daily, cursor-paged)
//
// All three tiers share the same SADD ledger; a repo's mention count keeps
// growing whether it's hot, warm, cold, or freshly dropped.

import type { Logger } from 'pino';

import { readDataStore } from '../../lib/redis.js';
import { loadTrackedRepos } from '../../lib/util/tracked-repos.js';

// Shape of one repo entry inside `star-activity-deltas.repos`.
interface DeltaEntry {
  stars_now?: number;
  latest_d?: string;
  delta_24h?: { value?: number };
  delta_7d?: { value?: number };
  delta_30d?: { value?: number };
}

interface DeltaPayload {
  repos?: Record<string, DeltaEntry>;
}

// --------------------------------------------------------------------------
// Sort key — primary: 24h delta DESC; secondary: 7d delta DESC; tiebreaker:
// fullName ASC case-insensitive (per the registry-sort tiebreaker rule —
// see feedback_deterministic_sort_tiebreaker memory). Determinism matters
// because rank slices (51-500, 501+) flicker without it and the same N
// repos get covered every run.
// --------------------------------------------------------------------------

interface Ranked {
  fullName: string;
  d24: number;
  d7: number;
}

export function rankByVelocity(payload: DeltaPayload | null | undefined): Ranked[] {
  const repos = payload?.repos ?? {};
  const out: Ranked[] = [];
  for (const [fullName, entry] of Object.entries(repos)) {
    if (!fullName || fullName.indexOf('/') < 0) continue;
    const d24 = Number(entry?.delta_24h?.value);
    const d7 = Number(entry?.delta_7d?.value);
    out.push({
      fullName,
      d24: Number.isFinite(d24) ? d24 : 0,
      d7: Number.isFinite(d7) ? d7 : 0,
    });
  }
  out.sort((a, b) => {
    if (b.d24 !== a.d24) return b.d24 - a.d24;
    if (b.d7 !== a.d7) return b.d7 - a.d7;
    return a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase());
  });
  return out;
}

// --------------------------------------------------------------------------
// Hot tier (ranks 1..50). Returns the top N by 24h velocity. Falls back to
// loadTrackedRepos when star-activity-deltas is missing (cold-start case
// the first time after a new deploy reads empty redis).
// --------------------------------------------------------------------------

export async function pickHotRepos(opts: {
  limit: number;
  log: Logger;
}): Promise<{ repos: string[]; source: 'velocity' | 'registry-fallback' }> {
  const payload = await readDataStore<DeltaPayload>('star-activity-deltas').catch(() => null);
  const ranked = rankByVelocity(payload);
  if (ranked.length > 0) {
    return {
      repos: ranked.slice(0, opts.limit).map((r) => r.fullName),
      source: 'velocity',
    };
  }
  opts.log.warn('twitter-picker: star-activity-deltas empty, falling back to registry order');
  const tracked = await loadTrackedRepos({ log: opts.log });
  return {
    repos: Array.from(tracked.values()).slice(0, opts.limit),
    source: 'registry-fallback',
  };
}

// --------------------------------------------------------------------------
// Warm tier (ranks 51..500). Returns a SLICE of `[startRank, startRank+limit)`.
// The warm fetcher rotates through 4 buckets across the day (every 6h tick
// scans the next 113-repo chunk) so the full 450-repo warm tier is covered.
// --------------------------------------------------------------------------

export async function pickWarmRepos(opts: {
  startRank: number;
  limit: number;
  log: Logger;
}): Promise<{ repos: string[]; rankWindow: { from: number; to: number } }> {
  const payload = await readDataStore<DeltaPayload>('star-activity-deltas').catch(() => null);
  const ranked = rankByVelocity(payload);
  if (ranked.length <= opts.startRank) {
    return { repos: [], rankWindow: { from: opts.startRank, to: opts.startRank } };
  }
  const window = ranked.slice(opts.startRank, opts.startRank + opts.limit);
  return {
    repos: window.map((r) => r.fullName),
    rankWindow: { from: opts.startRank, to: opts.startRank + window.length },
  };
}

// --------------------------------------------------------------------------
// Cold tier (registry tail, ranks 501+). Walks alphabetically-sorted tail
// repos via a Redis-stored cursor. After a full pass, cursor wraps to 0.
//
// We compute the tail SET = registry repos NOT in top-500 of velocity.
// Then slice the sorted-by-fullName tail [cursor, cursor+limit).
// --------------------------------------------------------------------------

export async function pickColdRepos(opts: {
  limit: number;
  cursor: number;
  hotWarmBudget: number;
  log: Logger;
}): Promise<{ repos: string[]; nextCursor: number; tailSize: number }> {
  const [deltaPayload, tracked] = await Promise.all([
    readDataStore<DeltaPayload>('star-activity-deltas').catch(() => null),
    loadTrackedRepos({ log: opts.log }),
  ]);
  const ranked = rankByVelocity(deltaPayload);
  const hotWarm = new Set(ranked.slice(0, opts.hotWarmBudget).map((r) => r.fullName.toLowerCase()));

  // Tail = repos in registry but NOT in the top hotWarmBudget by velocity.
  // Sort by fullName case-insensitive for cursor stability across runs.
  const tail = Array.from(tracked.values())
    .filter((fn) => !hotWarm.has(fn.toLowerCase()))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  if (tail.length === 0) {
    return { repos: [], nextCursor: 0, tailSize: 0 };
  }
  const start = ((opts.cursor % tail.length) + tail.length) % tail.length;
  const slice = tail.slice(start, start + opts.limit);
  // Wrap-around: if our slice underflows, take from the head.
  if (slice.length < opts.limit && tail.length > opts.limit) {
    const remaining = opts.limit - slice.length;
    slice.push(...tail.slice(0, Math.min(remaining, start)));
  }
  const nextCursor = (start + slice.length) % tail.length;
  return { repos: slice, nextCursor, tailSize: tail.length };
}
