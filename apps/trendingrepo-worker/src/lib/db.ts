import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from './env.js';
import { DataStoreFatalError, FatalConfigError } from './errors.js';
import type { NormalizedItem, NormalizedMetric, TrendingItemRow, TrendingItemType } from './types.js';

let cached: SupabaseClient | null = null;

// Egress kill-switch (2026-05-27): Supabase egress hit 135% of the org
// free-tier quota (6.756/5 GB) and the bleed traced entirely to this
// worker's writes into trending_items/trending_metrics/trending_assets.
// Redis on TOOLBOX is the production data plane; these Supabase writes
// are duplicative. Default to OFF unless `WORKER_SUPABASE_WRITES=1` is
// explicitly set. All upsert/read helpers below honor the same gate.
function writesEnabled(): boolean {
  return process.env.WORKER_SUPABASE_WRITES === '1';
}

export function getDb(): SupabaseClient {
  if (cached !== null) return cached;
  const env = loadEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) {
    throw new FatalConfigError('SUPABASE_URL and SUPABASE_SERVICE_ROLE are required');
  }
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'x-trendingrepo-worker': '0.1' } },
  });
  return cached;
}

export async function pingDb(): Promise<boolean> {
  // Previously did `count: 'exact', head: true` over trending_items
  // (15K rows). Every health probe forced a full count(*), 46K total
  // calls in the last cycle. With writes disabled the worker has no
  // reason to even open a Supabase round-trip on /healthz, so return
  // true unconditionally when the kill-switch is off.
  if (!writesEnabled()) return true;
  return true;
}

export interface UpsertItemInput {
  item: NormalizedItem;
  trendingScoreApprox?: number;
}

export async function upsertItem(
  db: SupabaseClient,
  input: UpsertItemInput,
): Promise<{ id: string }> {
  if (!writesEnabled()) {
    // Egress kill-switch: short-circuit before opening a PostgREST
    // round-trip. Returns a deterministic synthetic id so callers
    // chaining `await writeMetric(ctx.db, id, ...)` keep working
    // without touching the network.
    return { id: `disabled:${input.item.source}/${input.item.source_id}` };
  }
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
  if (error) throw new DataStoreFatalError(`upsertItem failed (${i.source}/${i.source_id}): ${error.message}`, { code: error.code });
  return { id: (data as { id: string }).id };
}

export async function writeMetric(
  db: SupabaseClient,
  itemId: string,
  metric: NormalizedMetric,
): Promise<void> {
  if (!writesEnabled()) return;
  const capturedAt = new Date().toISOString();
  const row = {
    item_id: itemId,
    captured_at: capturedAt,
    captured_date: metric.captured_date ?? capturedAt.slice(0, 10),
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
    onConflict: 'item_id,captured_date',
    ignoreDuplicates: false,
  });
  if (error) throw new DataStoreFatalError(`writeMetric failed (${itemId}): ${error.message}`, { code: error.code });
}

export interface UpsertAssetInput {
  item_id: string;
  kind: 'logo' | 'badge' | 'thumbnail' | 'banner';
  url: string;
  alt?: string;
  simple_icons_slug?: string | null;
  brand_color?: string | null;
  raw?: Record<string, unknown>;
}

export async function upsertAsset(
  db: SupabaseClient,
  input: UpsertAssetInput,
): Promise<void> {
  if (!writesEnabled()) return;
  const row = {
    item_id: input.item_id,
    kind: input.kind,
    url: input.url,
    alt: input.alt ?? null,
    simple_icons_slug: input.simple_icons_slug ?? null,
    brand_color: input.brand_color ?? null,
    raw: input.raw ?? {},
  };
  const { error } = await db
    .from('trending_assets')
    .upsert(row, { onConflict: 'item_id,kind', ignoreDuplicates: false });
  if (error) throw new DataStoreFatalError(`upsertAsset failed (${input.item_id}/${input.kind}): ${error.message}`, { code: error.code });
}

export async function queryTopByType(
  db: SupabaseClient,
  type: TrendingItemType,
  limit = 200,
): Promise<TrendingItemRow[]> {
  if (!writesEnabled()) {
    // The biggest single egress source: `select('*')` of up to 3000
    // rows including the `raw` JSONB column. With writes off, return
    // an empty leaderboard rather than pulling ~600 MB/day from
    // Supabase. The downstream Redis cache keeps the previous payload.
    return [];
  }
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await db
    .from('trending_items')
    .select('*')
    .eq('type', type)
    .gte('last_seen_at', cutoff)
    .order('trending_score', { ascending: false })
    .limit(limit);
  if (error) throw new DataStoreFatalError(`queryTopByType failed: ${error.message}`, { code: error.code });
  return (data ?? []) as TrendingItemRow[];
}
