import type { SupabaseClient } from '@supabase/supabase-js';
import { computeMergeKeys, qualifiedNameSimilarity, serializeMergeKeys } from './dedup-keys.js';
import type {
  McpServerNormalized,
  MergeResult,
  McpSource,
  SecurityGrade,
  VendorDetection,
} from './types.js';

// Cap matches the +0.15 score boost ceiling: max(cross_source_count) - 1 = 3.
const CROSS_SOURCE_CAP = 4;
const QN_FUZZY_THRESHOLD = 0.85;

// Merge-or-insert one McpServerNormalized into trending_items. Idempotent:
// re-running the same source for the same MCP refreshes raw[source] without
// inflating cross_source_count.
export async function mergeAndUpsert(
  db: SupabaseClient,
  n: McpServerNormalized,
  vendor: VendorDetection,
): Promise<MergeResult> {
  const keys = computeMergeKeys(n);
  const keyStrings = serializeMergeKeys(keys);

  // 1. Find existing row by ANY merge key (priority order: github > registry_pkg > qualified_name).
  //    Single SQL call: raw->'merge_keys' ?| array[<all keys>], then ranked client-side.
  let existing: ExistingRow | null = null;
  if (keyStrings.length > 0) {
    existing = await findByAnyKey(db, keyStrings);

    // Guard against weak qualified_name false-positives. If the ONLY way we
    // matched was via qualified_name (no shared github/registry key) AND the
    // similarity is low, treat as no-match and insert fresh.
    if (existing && isOnlyQualifiedNameMatch(existing.merge_keys, keyStrings)) {
      const sim = qualifiedNameSimilarity(n.qualified_name, existing.slug);
      if (sim < QN_FUZZY_THRESHOLD) {
        existing = null;
      }
    }
  }

  if (existing === null) {
    return insertNew(db, n, vendor, keyStrings);
  }
  return mergeInto(db, existing, n, vendor, keyStrings);
}

interface ExistingRow {
  id: string;
  slug: string;
  description: string | null;
  vendor: string | null;
  cross_source_count: number;
  absolute_popularity: number;
  raw: Record<string, unknown>;
  merge_keys: string[];
}

async function findByAnyKey(db: SupabaseClient, keyStrings: string[]): Promise<ExistingRow | null> {
  // merge_keys is a top-level text[] column with a GIN index (see migration
  // 20260427000000_mcp_score_boost.sql). overlaps() compiles to the
  // postgres `&&` operator, indexed.
  const { data, error } = await db
    .from('trending_items')
    .select('id, slug, description, vendor, cross_source_count, absolute_popularity, raw, merge_keys')
    .eq('type', 'mcp')
    .overlaps('merge_keys', keyStrings)
    .limit(1);
  if (error) {
    throw new Error(`mergeAndUpsert lookup failed: ${error.message}`);
  }
  if (!data || data.length === 0) return null;
  return toExistingRow(data[0] as RawCandidate);
}

interface RawCandidate {
  id: string;
  slug: string;
  description: string | null;
  vendor: string | null;
  cross_source_count: number;
  absolute_popularity: number;
  raw: Record<string, unknown>;
  merge_keys: string[] | null;
}

function toExistingRow(c: RawCandidate): ExistingRow {
  return {
    id: c.id,
    slug: c.slug,
    description: c.description,
    vendor: c.vendor,
    cross_source_count: c.cross_source_count,
    absolute_popularity: c.absolute_popularity,
    raw: c.raw,
    merge_keys: c.merge_keys ?? [],
  };
}

function isOnlyQualifiedNameMatch(existingKeys: string[], incomingKeys: string[]): boolean {
  const overlap = incomingKeys.filter((k) => existingKeys.includes(k));
  return overlap.length > 0 && overlap.every((k) => k.startsWith('qn:'));
}

async function insertNew(
  db: SupabaseClient,
  n: McpServerNormalized,
  vendor: VendorDetection,
  keyStrings: string[],
): Promise<MergeResult> {
  const raw = {
    sources: [n.source],
    source_ids: { [n.source]: n.source_id },
    security_grade: n.security_grade,
    is_official_vendor: vendor.is_official_vendor,
    vendor_strategy: vendor.strategy,
    [n.source]: n.raw,
  };
  const row = {
    type: 'mcp' as const,
    source: n.source,
    source_id: n.source_id,
    slug: n.qualified_name.toLowerCase(),
    title: n.name,
    description: n.description,
    url: n.github_url ?? `https://${n.source}.invalid/${n.source_id}`,
    author: n.owner,
    vendor: vendor.vendor_slug,
    cross_source_count: 1,
    absolute_popularity: n.popularity_signal,
    merge_keys: keyStrings,
    last_seen_at: new Date().toISOString(),
    raw,
  };

  const { data, error } = await db
    .from('trending_items')
    .upsert(row, { onConflict: 'source,source_id' })
    .select('id')
    .single();
  if (error) {
    throw new Error(`mergeAndUpsert insert failed (${n.source}/${n.source_id}): ${error.message}`);
  }
  return {
    id: (data as { id: string }).id,
    mergedFrom: [n.source],
    cross_source_count: 1,
    inserted: true,
  };
}

async function mergeInto(
  db: SupabaseClient,
  existing: ExistingRow,
  n: McpServerNormalized,
  vendor: VendorDetection,
  keyStrings: string[],
): Promise<MergeResult> {
  const prevRaw = existing.raw as RawShape;
  const prevSources: McpSource[] = Array.isArray(prevRaw.sources) ? (prevRaw.sources as McpSource[]) : [];
  const alreadyHasSource = prevSources.includes(n.source);

  const newSources: McpSource[] = alreadyHasSource ? prevSources : [...prevSources, n.source];
  const newCount = Math.min(
    alreadyHasSource ? existing.cross_source_count : existing.cross_source_count + 1,
    CROSS_SOURCE_CAP,
  );

  const prevSourceIds = (prevRaw.source_ids as Record<string, string> | undefined) ?? {};
  const prevOfficial = Boolean(prevRaw.is_official_vendor);
  const prevGrade = (prevRaw.security_grade as SecurityGrade | null | undefined) ?? null;

  const newRaw: RawShape = {
    ...prevRaw,
    sources: newSources,
    source_ids: { ...prevSourceIds, [n.source]: n.source_id },
    security_grade: bestGrade(prevGrade, n.security_grade),
    is_official_vendor: prevOfficial || vendor.is_official_vendor,
    [n.source]: n.raw,
  };

  const patch: Record<string, unknown> = {
    cross_source_count: newCount,
    raw: newRaw,
    description: existing.description ?? n.description,
    vendor: existing.vendor ?? vendor.vendor_slug,
    absolute_popularity: Math.max(existing.absolute_popularity, n.popularity_signal),
    merge_keys: dedupe([...existing.merge_keys, ...keyStrings]),
    last_seen_at: new Date().toISOString(),
  };

  const { error } = await db
    .from('trending_items')
    .update(patch)
    .eq('id', existing.id);
  if (error) {
    throw new Error(`mergeAndUpsert merge failed (${existing.id}): ${error.message}`);
  }

  return {
    id: existing.id,
    mergedFrom: newSources,
    cross_source_count: newCount,
    inserted: false,
  };
}

interface RawShape {
  sources?: McpSource[];
  source_ids?: Record<string, string>;
  security_grade?: SecurityGrade | null;
  is_official_vendor?: boolean;
  [k: string]: unknown;
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

const GRADE_RANK: Record<SecurityGrade, number> = { A: 4, B: 3, C: 2, F: 1 };

export function bestGrade(
  a: SecurityGrade | null | undefined,
  b: SecurityGrade | null | undefined,
): SecurityGrade | null {
  if (!a && !b) return null;
  if (!a) return b ?? null;
  if (!b) return a ?? null;
  return GRADE_RANK[a] >= GRADE_RANK[b] ? a : b;
}
