// Tracked-repo loader for source fetchers running on the worker.
//
// On Railway the filesystem is unavailable for cron-driven payloads so we
// read the Map<lowerFullName, canonicalFullName> from Redis instead. Slugs:
//   - ss:data:v1:trending      (trending.json buckets shape)
//   - ss:data:v1:recent-repos  (recent-repos.json shape)
//
// Failures are non-fatal: if a slug is missing or malformed we log a warn
// and proceed with whatever we managed to assemble. An empty Map is still
// a valid result — callers that need at least one tracked repo enforce that.

import type { Logger } from 'pino';
import { getRedis } from '../redis.js';

const NAMESPACE = 'ss:data:v1';

interface TrendingPayload {
  buckets?: Record<string, Record<string, unknown[]>>;
}

interface RecentPayload {
  items?: unknown[];
  rows?: unknown[];
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function addFullName(out: Map<string, string>, raw: unknown): void {
  const full = asString(raw);
  if (!full || !full.includes('/')) return;
  const lower = full.toLowerCase();
  if (!out.has(lower)) out.set(lower, full);
}

function recentRepoRows(payload: RecentPayload | unknown[] | null): unknown[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const candidate = payload as RecentPayload;
  if (Array.isArray(candidate.items)) return candidate.items;
  if (Array.isArray(candidate.rows)) return candidate.rows;
  return [];
}

async function readSlug<T>(slug: string, log?: Logger): Promise<T | null> {
  const redis = await getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(`${NAMESPACE}:${slug}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    log?.warn({ slug, err: (err as Error).message }, 'tracked-repos: failed to read slug');
    return null;
  }
}

export async function loadTrackedRepos(opts: { log?: Logger } = {}): Promise<Map<string, string>> {
  const { log } = opts;
  const tracked = new Map<string, string>();

  const trending = await readSlug<TrendingPayload>('trending', log);
  if (trending && trending.buckets) {
    for (const langMap of Object.values(trending.buckets)) {
      if (!langMap) continue;
      for (const rows of Object.values(langMap)) {
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          if (!row || typeof row !== 'object') continue;
          const r = row as Record<string, unknown>;
          addFullName(tracked, r.repo_name ?? r.fullName ?? r.full_name);
        }
      }
    }
  }

  const recent = await readSlug<RecentPayload>('recent-repos', log);
  for (const row of recentRepoRows(recent)) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    addFullName(tracked, r.repo_name ?? r.fullName ?? r.full_name);
  }

  return tracked;
}

export async function readDataStoreSlug<T = unknown>(
  slug: string,
  opts: { log?: Logger } = {},
): Promise<T | null> {
  return readSlug<T>(slug, opts.log);
}
