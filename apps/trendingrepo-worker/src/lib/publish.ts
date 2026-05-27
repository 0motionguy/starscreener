import type { SupabaseClient } from '@supabase/supabase-js';
import { writeDataStore } from './redis.js';
import { queryTopByType } from './db.js';
import type { TrendingItemRow, TrendingItemType } from './types.js';

export interface LeaderboardItem {
  rank: number;
  id: string;
  slug: string;
  title: string;
  url: string;
  trending_score: number;
  metrics: {
    downloads_7d?: number;
    stars_total?: number;
    installs_total?: number;
  };
  description: string | null;
  vendor: string | null;
  author: string | null;
  language: string | null;
  license: string | null;
  thumbnail_url: string | null;
  tags: string[];
  agents: string[];
  cross_source_count: number;
  raw: { sources: string[] };
}

export interface LeaderboardPayload {
  type: TrendingItemType;
  generatedAt: string;
  fetchedAt: string;
  items: LeaderboardItem[];
}

const DEFAULT_LIMIT = 3000;

export async function publishLeaderboard(
  db: SupabaseClient,
  type: TrendingItemType,
  limit = DEFAULT_LIMIT,
): Promise<{ items: number; writtenAt: string; redisPublished: boolean }> {
  // Egress kill-switch (2026-05-27): when Supabase writes are gated off
  // queryTopByType returns []. Without this guard we'd overwrite the
  // existing Redis leaderboard with an empty payload, violating the
  // keep-last-50 rule (docs/INGESTION.md#rule-keep-last-50-cache).
  if (process.env.WORKER_SUPABASE_WRITES !== '1') {
    return { items: 0, writtenAt: new Date().toISOString(), redisPublished: false };
  }
  const rows = await queryTopByType(db, type, limit);
  const now = new Date().toISOString();
  const payload: LeaderboardPayload = {
    type,
    generatedAt: now,
    fetchedAt: now,
    items: rows.map((r, i) => projectRow(r, i + 1)),
  };
  // Slug uses a hyphen separator so the resulting key
  // `ss:data:v1:trending-<type>` stays a single bare slug and never
  // collides with the app's `ss:data:v1:trending` (which is a different
  // payload entirely — the OSS Insight discovery snapshot, not a
  // Supabase-backed leaderboard).
  const result = await writeDataStore(`trending-${type}`, payload);
  return {
    items: payload.items.length,
    writtenAt: result.writtenAt,
    redisPublished: result.source === 'redis',
  };
}

function projectRow(r: TrendingItemRow, rank: number): LeaderboardItem {
  return {
    rank,
    id: r.id,
    slug: r.slug,
    title: r.title,
    url: r.url,
    trending_score: r.trending_score,
    metrics: pickMetrics(r),
    description: r.description,
    vendor: r.vendor,
    author: r.author,
    language: r.language,
    license: r.license,
    thumbnail_url: r.thumbnail_url,
    tags: Array.isArray(r.tags) ? r.tags : [],
    agents: Array.isArray(r.agents) ? r.agents : [],
    cross_source_count: r.cross_source_count,
    raw: { sources: pickSources(r) },
  };
}

function pickMetrics(row: TrendingItemRow): LeaderboardItem['metrics'] {
  const out: LeaderboardItem['metrics'] = {};
  if (row.type === 'repo') out.stars_total = row.absolute_popularity;
  else out.downloads_7d = row.absolute_popularity;
  return out;
}

function pickSources(r: TrendingItemRow): string[] {
  const v = r.raw?.sources;
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const s of v) {
    if (typeof s === 'string' && s.length > 0) out.push(s);
  }
  return out;
}
