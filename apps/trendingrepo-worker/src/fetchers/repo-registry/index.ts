// repo-registry — persistent, accumulating repo collection.
//
// The `trending` slug is an EPHEMERAL snapshot: each oss-trending run replaces
// it, so a repo that leaves OSSInsight trending vanishes from the site (and the
// tracked count churns instead of growing). This fetcher accumulates every repo
// ever seen into a durable `repo-registry` redis slug — read → union → dedupe →
// cap, never drop — so the collection grows past 1000 and dropped repos are
// RETAINED with their last-known stats. The app folds this in via
// src/lib/derived-repos/loaders/registry.ts.
//
// Seeds (first run unions ≈850-1000 immediately, all already AI-curated):
//   - `trending` buckets   → authoritative stats (stars/lang/desc/score)
//   - `repo-metadata`      → fill-only (name registered; stars come from
//                            getRepoMetadata app-side at render)
//   - `consensus-trending` → fill-only
//   - `recent-repos`       → fill-only
//
// Cadence :47 (after oss-trending :22, recent-repos :25, repo-metadata :13).

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';

const REGISTRY_CAP = 2000;
const REGISTRY_VERSION = 1;

export interface RegistryEntry {
  fullName: string;
  repoId: string | null;
  language: string | null;
  description: string;
  stars: number;
  forks: number;
  totalScore: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSource: string;
}

export interface RegistryPayload {
  version: number;
  writtenAt: string;
  count: number;
  repos: Record<string, RegistryEntry>;
}

// --- source shapes (subsets we read) --------------------------------------
interface OssRow {
  repo_id?: string; repo_name?: string; primary_language?: string;
  description?: string; stars?: string; forks?: string; total_score?: string;
}
interface TrendingPayload { buckets?: Record<string, Record<string, OssRow[]>>; }
type NameRow = Record<string, unknown>;
interface ItemsPayload { items?: NameRow[] }

function intOf(v: unknown): number {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}
function strOf(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function fullNameOf(row: NameRow): string {
  const v = row.fullName ?? row.full_name ?? row.repo_name ?? row.name;
  return typeof v === 'string' ? v : '';
}

export interface RegistrySources {
  trending: TrendingPayload | null;
  metadata: ItemsPayload | null;
  consensus: ItemsPayload | null;
  recent: ItemsPayload | null;
}

/**
 * Pure registry accumulator: seed from `existing`, upsert trending (full
 * stats), fill-only from metadata/consensus/recent (register name + refresh
 * lastSeenAt, never clobber fresher trending stats), then LRU-cap by
 * lastSeenAt desc. Never deletes an unseen entry except under cap pressure.
 */
export function buildRegistry(
  existing: RegistryPayload | null,
  src: RegistrySources,
  now: string,
  cap = REGISTRY_CAP,
): RegistryPayload {
  const map = new Map<string, RegistryEntry>();
  for (const [k, e] of Object.entries(existing?.repos ?? {})) {
    if (e && typeof e === 'object' && typeof (e as RegistryEntry).fullName === 'string') {
      map.set(k, { ...(e as RegistryEntry) });
    }
  }

  // Authoritative pass: trending rows carry stats.
  for (const langMap of Object.values(src.trending?.buckets ?? {})) {
    for (const rows of Object.values(langMap ?? {})) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const fullName = strOf(row.repo_name);
        if (!fullName.includes('/')) continue;
        const key = fullName.toLowerCase();
        const prev = map.get(key);
        map.set(key, {
          fullName,
          repoId: strOf(row.repo_id) || prev?.repoId || null,
          language: strOf(row.primary_language) || prev?.language || null,
          description: strOf(row.description) || prev?.description || '',
          stars: intOf(row.stars) || prev?.stars || 0,
          forks: intOf(row.forks) || prev?.forks || 0,
          totalScore: row.total_score != null ? intOf(row.total_score) : (prev?.totalScore ?? null),
          firstSeenAt: prev?.firstSeenAt ?? now,
          lastSeenAt: now,
          lastSource: 'trending',
        });
      }
    }
  }

  // Fill-only passes: register the name + refresh lastSeenAt; keep prior stats.
  const fillOnly = (payload: ItemsPayload | null, source: string): void => {
    for (const row of payload?.items ?? []) {
      const fullName = fullNameOf(row);
      if (!fullName.includes('/')) continue;
      const key = fullName.toLowerCase();
      const prev = map.get(key);
      if (prev) {
        prev.lastSeenAt = now;
        continue;
      }
      map.set(key, {
        fullName,
        repoId: typeof row.githubId !== 'undefined' ? strOf(String(row.githubId)) || null : null,
        language: typeof row.language === 'string' ? row.language : null,
        description: strOf(row.description),
        stars: intOf(row.stars),
        forks: intOf(row.forks),
        totalScore: null,
        firstSeenAt: now,
        lastSeenAt: now,
        lastSource: source,
      });
    }
  };
  fillOnly(src.metadata, 'repo-metadata');
  fillOnly(src.consensus, 'consensus-trending');
  fillOnly(src.recent, 'recent-repos');

  // LRU cap by lastSeenAt desc (just-seen trending repos always survive).
  let entries = Array.from(map.values());
  if (entries.length > cap) {
    entries = entries
      .sort((a, b) => (b.lastSeenAt < a.lastSeenAt ? -1 : b.lastSeenAt > a.lastSeenAt ? 1 : 0))
      .slice(0, cap);
  }
  const repos: Record<string, RegistryEntry> = {};
  for (const e of entries) repos[e.fullName.toLowerCase()] = e;

  return { version: REGISTRY_VERSION, writtenAt: now, count: entries.length, repos };
}

const fetcher: Fetcher = {
  name: 'repo-registry',
  schedule: '47 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('repo-registry dry-run');
      return done(startedAt, 0, false);
    }

    const [existing, trending, metadata, consensus, recent] = await Promise.all([
      readDataStore<RegistryPayload>('repo-registry').catch(() => null),
      readDataStore<TrendingPayload>('trending').catch(() => null),
      readDataStore<ItemsPayload>('repo-metadata').catch(() => null),
      readDataStore<ItemsPayload>('consensus-trending').catch(() => null),
      readDataStore<ItemsPayload>('recent-repos').catch(() => null),
    ]);

    const before = existing?.count ?? Object.keys(existing?.repos ?? {}).length;
    const payload = buildRegistry(
      existing,
      { trending, metadata, consensus, recent },
      new Date().toISOString(),
    );
    const result = await writeDataStore('repo-registry', payload);

    ctx.log.info(
      {
        before,
        after: payload.count,
        added: payload.count - before,
        sources: {
          trending: trending?.buckets ? Object.keys(trending.buckets).length : 0,
          metadata: metadata?.items?.length ?? 0,
          consensus: consensus?.items?.length ?? 0,
          recent: recent?.items?.length ?? 0,
        },
        redis: result.source,
      },
      'repo-registry published',
    );
    return done(startedAt, payload.count, result.source === 'redis');
  },
};

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'repo-registry',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
