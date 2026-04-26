import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from './env.js';
import type { NormalizedItem, NormalizedMetric, TrendingItemRow, TrendingItemType } from './types.js';

let cached: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (cached !== null) return cached;
  const env = loadEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE are required');
  }
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'x-trendingrepo-worker': '0.1' } },
  });
  return cached;
}

export async function pingDb(db: SupabaseClient = getDb()): Promise<boolean> {
  const { error } = await db.from('trending_items').select('id', { count: 'exact', head: true });
  return !error;
}

export interface UpsertItemInput {
  item: NormalizedItem;
  trendingScoreApprox?: number;
}

export async function upsertItem(
  db: SupabaseClient,
  input: UpsertItemInput,
): Promise<{ id: string }> {
  const i = input.item;
  const row = {
    type: i.type,
    source: i.source,
    source_id: i.source_id,
    slug: i.slug,
    title: i.title,
    description: i.description ?? null,
    url: i.url,
    author: i.author ?? null,
    vendor: i.vendor ?? null,
    agents: i.agents ?? [],
    tags: i.tags ?? [],
    language: i.language ?? null,
    license: i.license ?? null,
    thumbnail_url: i.thumbnail_url ?? null,
    absolute_popularity: i.absolute_popularity ?? 0,
    cross_source_count: i.cross_source_count ?? 1,
    last_modified_at: i.last_modified_at ?? null,
    last_seen_at: new Date().toISOString(),
    raw: i.raw ?? {},
    ...(input.trendingScoreApprox !== undefined ? { trending_score: input.trendingScoreApprox } : {}),
  };
  const { data, error } = await db
    .from('trending_items')
    .upsert(row, { onConflict: 'source,source_id' })
    .select('id')
    .single();
  if (error) throw new Error(`upsertItem failed (${i.source}/${i.source_id}): ${error.message}`);
  return { id: (data as { id: string }).id };
}

export async function writeMetric(
  db: SupabaseClient,
  itemId: string,
  metric: NormalizedMetric,
): Promise<void> {
  const row = {
    item_id: itemId,
    captured_at: new Date().toISOString(),
    downloads_total: metric.downloads_total ?? null,
    downloads_7d: metric.downloads_7d ?? null,
    stars_total: metric.stars_total ?? null,
    installs_total: metric.installs_total ?? null,
    upvotes: metric.upvotes ?? null,
    comments: metric.comments ?? null,
    velocity_delta_7d: metric.velocity_delta_7d ?? null,
    source_rank: metric.source_rank ?? null,
    raw: metric.raw ?? {},
  };
  const { error } = await db.from('trending_metrics').upsert(row, {
    onConflict: 'item_id,captured_at',
    ignoreDuplicates: false,
  });
  if (error) throw new Error(`writeMetric failed (${itemId}): ${error.message}`);
}

export async function queryTopByType(
  db: SupabaseClient,
  type: TrendingItemType,
  limit = 200,
): Promise<TrendingItemRow[]> {
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await db
    .from('trending_items')
    .select('*')
    .eq('type', type)
    .gte('last_seen_at', cutoff)
    .order('trending_score', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`queryTopByType failed: ${error.message}`);
  return (data ?? []) as TrendingItemRow[];
}
