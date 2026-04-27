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
  description: string | null;
  vendor: string | null;
  cross_source_count: number;
  is_official_vendor: boolean;
  security_grade: string | null;
  logo_url: string | null;
  brand_color: string | null;
  trending_score: number;
  metrics: {
    downloads_7d?: number;
    stars_total?: number;
    installs_total?: number;
  };
}

interface AssetRow {
  item_id: string;
  kind: string;
  url: string;
  brand_color: string | null;
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
  const assetsByItem = type === 'mcp' ? await loadAssets(db, rows.map((r) => r.id)) : new Map();
  const payload: LeaderboardPayload = {
    type,
    generatedAt: new Date().toISOString(),
    items: rows.map((r, i) => {
      const assets = assetsByItem.get(r.id) ?? {};
      const raw = (r.raw ?? {}) as Record<string, unknown>;
      return {
        rank: i + 1,
        id: r.id,
        slug: r.slug,
        title: r.title,
        url: r.url,
        description: r.description,
        vendor: r.vendor,
        cross_source_count: r.cross_source_count,
        is_official_vendor: Boolean(raw.is_official_vendor),
        security_grade: typeof raw.security_grade === 'string' ? (raw.security_grade as string) : null,
        logo_url: (assets.logo as string | undefined) ?? null,
        brand_color: (assets.brandColor as string | undefined) ?? null,
        trending_score: r.trending_score,
        metrics: pickMetrics(r),
      };
    }),
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

async function loadAssets(
  db: SupabaseClient,
  itemIds: string[],
): Promise<Map<string, { logo?: string; brandColor?: string; verified?: boolean }>> {
  if (itemIds.length === 0) return new Map();
  const { data, error } = await db
    .from('trending_assets')
    .select('item_id, kind, url, brand_color')
    .in('item_id', itemIds);
  if (error) {
    // Don't fail publish on asset query — just skip logos.
    return new Map();
  }
  const map = new Map<string, { logo?: string; brandColor?: string; verified?: boolean }>();
  for (const row of (data ?? []) as AssetRow[]) {
    const entry = map.get(row.item_id) ?? {};
    if (row.kind === 'logo') {
      entry.logo = row.url;
      entry.brandColor = row.brand_color ?? undefined;
    }
    if (row.kind === 'badge') entry.verified = true;
    map.set(row.item_id, entry);
  }
  return map;
}

function pickMetrics(row: TrendingItemRow): LeaderboardItem['metrics'] {
  const out: LeaderboardItem['metrics'] = {};
  if (row.type === 'repo') out.stars_total = row.absolute_popularity;
  else if (row.type === 'mcp' || row.type === 'skill') out.installs_total = row.absolute_popularity;
  else out.downloads_7d = row.absolute_popularity;
  return out;
}
