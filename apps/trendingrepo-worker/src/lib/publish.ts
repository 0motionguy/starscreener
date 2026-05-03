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
    // MCP usage telemetry — aggregated across all 4 MCP source fetchers
    // (pulsemcp, smithery, glama, official) by `pickMcpUsage`. Each source
    // writes its own copy under `raw.<source>.metrics.{visitors_4w,
    // use_count, popularity_24h, popularity_7d, popularity_30d,
    // quality_score}`; we take the MAX across sources for each window so
    // a server present in multiple registries doesn't get summed redundantly
    // (the same monthly visitor pool would appear in every registry).
    // null when none of the sources reported the field; undefined-stripped
    // before publish for payload size.
    installs_24h?: number | null;
    installs_7d?: number | null;
    installs_30d?: number | null;
    visitors_4w?: number | null;
    use_count?: number | null;
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
  // Smithery quality score (0..1) scaled to 0..100. Real per-server data
  // from the upstream listing endpoint — used as the QUALITY column on /mcp.
  quality_score: number | null;
  // Glama security grade (A / B / C / F) when present.
  security_grade: 'A' | 'B' | 'C' | 'F' | null;
  // ISO timestamp of the most recent release / creation across sources.
  last_release_at: string | null;
  // For MCPs: the array of registries this item appears in. Drives the
  // per-registry source pills on the /mcp page (anthropic / smithery /
  // glama / pulsemcp / awesome-mcp). `homepage` (when present) is the
  // upstream project URL — useful for a real favicon when `url` is a
  // registry placeholder like `smithery.invalid/<uuid>`.
  raw: { sources: string[]; homepage?: string };
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

// Default top-N to publish per type. Sprint bump 500→3000 (Phase-5
// escalation 2026-04-29): same calculus that lifted skillsmp 200→5000 —
// the front-end can now show "All Time (N)" leaderboards that read like
// a real catalog, not a top-N teaser. Payload still ~few MB, in line
// with /skills' bundled output.
const DEFAULT_LIMIT = 3000;

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
  const usage = pickMcpUsage(r);
  const stars = pickMcpStars(r);
  const iconUrl = pickIconUrl(r);
  const homepage = pickHomepage(r);
  return {
    rank,
    id: r.id,
    slug: r.slug,
    title: r.title,
    url: r.url,
    trending_score: r.trending_score,
    metrics: {
      ...pickMetrics(r),
      ...usage,
      ...(stars !== null ? { stars_total: stars } : {}),
    },
    description: r.description,
    vendor: r.vendor,
    author: r.author,
    language: r.language,
    license: r.license,
    // Prefer a per-server icon when any source supplied one (Smithery's
    // `iconUrl` is the big win — covers a large fraction of its catalog).
    // Falls back to the merger's `thumbnail_url` (Simple Icons brand mark
    // for vendor-detected rows). Consumer can still favicon by URL host.
    thumbnail_url: iconUrl ?? r.thumbnail_url,
    tags: Array.isArray(r.tags) ? r.tags : [],
    agents: Array.isArray(r.agents) ? r.agents : [],
    cross_source_count: r.cross_source_count,
    package_name: pkg.name,
    package_registry: pkg.registry,
    is_official_vendor: pickBoolean(r.raw?.is_official_vendor) ?? false,
    quality_score: pickQualityScore(r),
    security_grade: pickSecurityGrade(r),
    last_release_at: pickLastReleaseAt(r),
    // Surface the upstream homepage so a Smithery item whose `r.url` is
    // `https://smithery.invalid/<uuid>` can still render a real favicon
    // from its actual project URL.
    raw: { sources, ...(homepage ? { homepage } : {}) },
  };
}

// Smithery's `score` is a 0..1 quality signal on the listing endpoint.
// Scale to 0..100 for the UI. Real per-server data; no synthesis.
function pickQualityScore(r: TrendingItemRow): number | null {
  if (r.type !== 'mcp') return null;
  const smithery = r.raw?.smithery;
  if (smithery && typeof smithery === 'object') {
    const s = pickNumber((smithery as Record<string, unknown>).score);
    if (s !== null && s >= 0 && s <= 1) return Math.round(s * 100);
  }
  return null;
}

// Glama exposes A / B / C / F security grades on its listing endpoint.
function pickSecurityGrade(r: TrendingItemRow): 'A' | 'B' | 'C' | 'F' | null {
  if (r.type !== 'mcp') return null;
  // The merger writes a top-level normalized `security_grade` on raw; older
  // rows just carry per-source `raw.glama.security_grade`/`grade`.
  const candidates: unknown[] = [
    r.raw?.security_grade,
    (r.raw?.glama as Record<string, unknown> | undefined)?.security_grade,
    (r.raw?.glama as Record<string, unknown> | undefined)?.grade,
  ];
  for (const v of candidates) {
    const s = pickString(v)?.toUpperCase();
    if (s === 'A' || s === 'B' || s === 'C' || s === 'F') return s;
  }
  return null;
}

// Most-recent release / creation timestamp across the four MCP sources.
// Smithery's `createdAt` is the catalog-listing date — used as a release
// proxy when no package metadata exists.
function pickLastReleaseAt(r: TrendingItemRow): string | null {
  if (r.type !== 'mcp') return null;
  for (const src of MCP_USAGE_SOURCES) {
    const nested = r.raw?.[src];
    if (!nested || typeof nested !== 'object') continue;
    const obj = nested as Record<string, unknown>;
    const candidate =
      pickString(obj.lastReleaseAt) ??
      pickString(obj.createdAt) ??
      pickString(obj.updatedAt) ??
      pickString(obj.last_modified_at);
    if (candidate) return candidate;
  }
  return null;
}

// Walk per-source raw blobs for a real GitHub `stars` count (Glama is the
// only one that exposes it in the listing endpoint as of 2026-04-29).
function pickMcpStars(r: TrendingItemRow): number | null {
  if (r.type !== 'mcp') return null;
  for (const src of MCP_USAGE_SOURCES) {
    const nested = r.raw?.[src];
    if (!nested || typeof nested !== 'object') continue;
    const obj = nested as Record<string, unknown>;
    const v = pickNumber(obj.github_stars) ?? pickNumber(obj.stars);
    if (v !== null) return v;
  }
  return null;
}

// First per-server icon URL we can find across the four MCP sources. Smithery
// emits `iconUrl` on most servers; Glama / PulseMCP / Official rarely expose
// per-server icons. Returns null when nothing supplied — callers fall back
// to thumbnail_url / GitHub owner avatar / registry favicon.
function pickIconUrl(r: TrendingItemRow): string | null {
  if (r.type !== 'mcp') return null;
  for (const src of MCP_USAGE_SOURCES) {
    const nested = r.raw?.[src];
    if (!nested || typeof nested !== 'object') continue;
    const obj = nested as Record<string, unknown>;
    const v = pickString(obj.iconUrl) ?? pickString(obj.icon_url);
    if (v) return v;
  }
  return null;
}

// Project homepage / repository URL from per-source raw so the consumer has
// a real URL to favicon when `r.url` is a registry placeholder.
function pickHomepage(r: TrendingItemRow): string | null {
  if (r.type !== 'mcp') return null;
  for (const src of MCP_USAGE_SOURCES) {
    const nested = r.raw?.[src];
    if (!nested || typeof nested !== 'object') continue;
    const obj = nested as Record<string, unknown>;
    const direct = pickString(obj.homepage) ?? pickString(obj.github_url);
    if (direct) return direct;
    const repo = obj.repository;
    if (repo && typeof repo === 'object') {
      const repoUrl = pickString((repo as Record<string, unknown>).url);
      if (repoUrl) return repoUrl;
    }
  }
  return null;
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

// MCP source slugs the merger writes to `raw.<source>` — must match
// `McpSource` in apps/trendingrepo-worker/src/lib/mcp/types.ts. We walk
// each one and take MAX across sources for each install window so a server
// present in multiple registries doesn't get its visitors/use-counts
// summed redundantly (the same monthly visitor pool would otherwise
// appear in every registry that lists the server).
const MCP_USAGE_SOURCES = ['pulsemcp', 'smithery', 'glama', 'official'] as const;
const MCP_USAGE_FIELDS = [
  'installs_24h',
  'installs_7d',
  'installs_30d',
  'visitors_4w',
  'use_count',
] as const;

type McpUsageBlock = {
  installs_24h?: number | null;
  installs_7d?: number | null;
  installs_30d?: number | null;
  visitors_4w?: number | null;
  use_count?: number | null;
};

// Per-source metric key → unified install-window key. The metric names
// the source fetchers emit (`popularity_24h`, `popularity_7d`,
// `popularity_30d`) collapse to `installs_24h/7d/30d` on the leaderboard
// surface so the consumer doesn't need to know each source's vocabulary.
const SOURCE_TO_UNIFIED: Record<string, keyof McpUsageBlock> = {
  popularity_24h: 'installs_24h',
  popularity_7d: 'installs_7d',
  popularity_30d: 'installs_30d',
  visitors_4w: 'visitors_4w',
  use_count: 'use_count',
};

function pickMcpUsage(r: TrendingItemRow): McpUsageBlock {
  if (r.type !== 'mcp') return {};
  const acc: Record<keyof McpUsageBlock, number | null> = {
    installs_24h: null,
    installs_7d: null,
    installs_30d: null,
    visitors_4w: null,
    use_count: null,
  };
  const updateMax = (key: keyof McpUsageBlock, v: number) => {
    const cur = acc[key];
    if (cur === null || v > cur) acc[key] = v;
  };
  for (const src of MCP_USAGE_SOURCES) {
    const nested = r.raw?.[src];
    if (!nested || typeof nested !== 'object') continue;
    const obj = nested as Record<string, unknown>;
    // Modern path: per-source `metrics` subobject (set by buildMetrics in
    // each source's client). Newer Railway worker writes this; old rows may
    // not.
    const metrics = obj.metrics;
    if (metrics && typeof metrics === 'object') {
      for (const [srcKey, unifiedKey] of Object.entries(SOURCE_TO_UNIFIED)) {
        const n = pickNumber((metrics as Record<string, unknown>)[srcKey]);
        if (n !== null) updateMax(unifiedKey, n);
      }
    }
    // Legacy path: flat upstream fields on the per-source raw blob.
    // Smithery rows pre-metrics-subobject have `useCount` directly. Glama
    // exposes `useCount`/`installs`/`downloads` flat. PulseMCP exposes
    // visitors via `_meta` keys we can't easily walk here, so the modern
    // path is what fills those.
    const flatUseCount =
      pickNumber(obj.useCount) ??
      pickNumber(obj.use_count) ??
      pickNumber(obj.installs) ??
      pickNumber(obj.install_count) ??
      pickNumber(obj.downloads);
    if (flatUseCount !== null) updateMax('use_count', flatUseCount);
    const flatVisitors =
      pickNumber(obj.visitors_4w) ??
      pickNumber(obj.visitorsLastFourWeeks) ??
      pickNumber(obj.visitors);
    if (flatVisitors !== null) updateMax('visitors_4w', flatVisitors);
  }
  // Strip null entries so the payload only carries what's known.
  const out: McpUsageBlock = {};
  for (const f of MCP_USAGE_FIELDS) {
    if (acc[f] !== null) out[f] = acc[f] as number;
  }
  return out;
}

function pickNumber(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
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
