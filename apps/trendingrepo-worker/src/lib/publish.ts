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
}

export interface LeaderboardPayload {
  type: TrendingItemType;
  generatedAt: string;
  items: LeaderboardItem[];
}

export async function publishLeaderboard(
  db: SupabaseClient,
  type: TrendingItemType,
  limit = 200,
): Promise<{ items: number; writtenAt: string; redisPublished: boolean }> {
  const rows = await queryTopByType(db, type, limit);
  const payload: LeaderboardPayload = {
    type,
    generatedAt: new Date().toISOString(),
    items: rows.map((r, i) => ({
      rank: i + 1,
      id: r.id,
      slug: r.slug,
      title: r.title,
      url: r.url,
      trending_score: r.trending_score,
      metrics: pickMetrics(r),
    })),
  };
  const result = await writeDataStore(`trending:${type}`, payload);
  return {
    items: payload.items.length,
    writtenAt: result.writtenAt,
    redisPublished: result.source === 'redis',
  };
}

function pickMetrics(row: TrendingItemRow): LeaderboardItem['metrics'] {
  const out: LeaderboardItem['metrics'] = {};
  if (row.type === 'repo') out.stars_total = row.absolute_popularity;
  else if (row.type === 'mcp' || row.type === 'skill') out.installs_total = row.absolute_popularity;
  else out.downloads_7d = row.absolute_popularity;
  return out;
}
