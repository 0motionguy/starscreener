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
  // Rich fields — projected from `trending_items` columns that the merger
  // populates. Without these the consumer page (`coerceMcpItem` etc.) sees
  // a near-empty row and renders "—" everywhere.
  description: string | null;
  vendor: string | null;
  author: string | null;
  language: string | null;
  license: string | null;
  thumbnail_url: string | null;
  tags: string[];
  agents: string[];
  cross_source_count: number;
  // For MCPs: the upstream registry's package coordinates. Surfaced so the
  // /mcp page's package column populates and the npm-downloads /
  // pypi-downloads side-channel fetchers can discover packages to query.
  // Walked from `raw[source].package_name` per the merger's nesting; null
  // when no source carries a package field (stdio-only servers etc.).
  package_name: string | null;
  package_registry: 'npm' | 'pypi' | null;
  // For MCPs: official-vendor verification, surfaced on the /mcp pill.
  is_official_vendor: boolean;
  // For MCPs: the array of registries this item appears in. Drives the
  // per-registry source pills on the /mcp page (anthropic / smithery /
  // glama / pulsemcp / awesome-mcp).
  raw: { sources: string[] };
}

export interface LeaderboardPayload {
  type: TrendingItemType;
  generatedAt: string;
  // Mirrors `generatedAt` for consumers that look for `fetchedAt` (the
  // existing convention across `data/*.json` files). Identical value;
  // having both keys lets us migrate consumers gradually.
  fetchedAt: string;
  items: LeaderboardItem[];
}

// Default top-N to publish per type. 500 keeps the JSON under a few hundred
// KB while giving the front-end enough headroom to render multiple
// sub-leaderboards (Hottest / Most Downloaded / Liveness Champions / New)
// from the same payload without re-querying. Override per-call when needed.
const DEFAULT_LIMIT = 500;

export async function publishLeaderboard(
  db: SupabaseClient,
  type: TrendingItemType,
  limit = DEFAULT_LIMIT,
): Promise<{ items: number; writtenAt: string; redisPublished: boolean }> {
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
  const sources = pickSources(r);
  const pkg = pickPackage(r);
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
    package_name: pkg.name,
    package_registry: pkg.registry,
    is_official_vendor: pickBoolean(r.raw?.is_official_vendor) ?? false,
    raw: { sources },
  };
}

function pickMetrics(row: TrendingItemRow): LeaderboardItem['metrics'] {
  const out: LeaderboardItem['metrics'] = {};
  if (row.type === 'repo') out.stars_total = row.absolute_popularity;
  else if (row.type === 'mcp' || row.type === 'skill') out.installs_total = row.absolute_popularity;
  else out.downloads_7d = row.absolute_popularity;
  return out;
}

// Pull the merger's per-source list (`raw.sources = ['smithery', 'glama']`).
// Falls back to an empty array; downstream UI shows just `cross_source_count`
// on legacy rows that pre-date the sources array.
function pickSources(r: TrendingItemRow): string[] {
  const v = r.raw?.sources;
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const s of v) {
    if (typeof s === 'string' && s.length > 0) out.push(s);
  }
  return out;
}

// Walk the source-nested raw payloads (merger stores per-source data under
// `raw[sourceName] = n.raw`, where `n` was a McpServerNormalized). Return
// the first source that carries a non-empty package_name. The registry
// follows the same source — npm/pypi only; everything else collapses to null.
function pickPackage(
  r: TrendingItemRow,
): { name: string | null; registry: 'npm' | 'pypi' | null } {
  // Top-level package_name always wins — set explicitly when a single source
  // owns the row, or when a future merger denormalizes the field.
  const topName = pickString(r.raw?.package_name);
  if (topName) {
    const topReg = normalizeRegistry(r.raw?.package_registry);
    return { name: topName, registry: topReg };
  }
  // Otherwise walk the per-source nested raws.
  const sources = pickSources(r);
  for (const s of sources) {
    const nested = r.raw?.[s];
    if (!nested || typeof nested !== 'object') continue;
    const obj = nested as Record<string, unknown>;
    const name = pickString(obj.package_name);
    if (name) {
      const registry = normalizeRegistry(obj.package_registry);
      return { name, registry };
    }
  }
  return { name: null, registry: null };
}

function pickString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickBoolean(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  return null;
}

function normalizeRegistry(v: unknown): 'npm' | 'pypi' | null {
  const s = pickString(v)?.toLowerCase();
  if (s === 'npm') return 'npm';
  if (s === 'pypi') return 'pypi';
  return null;
}
