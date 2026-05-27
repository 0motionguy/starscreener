// registry-candidates — unified candidate-selection helpers for any
// worker fetcher that takes a list of repos to enrich.
//
// CONTEXT
// Pre-2026-05-27, every enricher rolled its own candidate selection:
// some unioned trending + recent + manual, some only read trending, some
// added the registry, some didn't. The result: registry-only (dropped)
// repos got enrichment from `repo-metadata` but not from `repo-profiles`,
// silently. The hardening plan named this "trending-tier centrism" as
// the systemic tech-debt.
//
// This helper centralises the two primitives:
//   - rankedRegistryFullNames(registry, limit)
//       → top-N fullNames from the registry, ordered by lastSeenAt desc.
//   - unionOrderedFullNames(...lists)
//       → dedupes lists preserving order (first occurrence wins).
//
// Compose them for the canonical pattern:
//   const trendingNames = extractTrendingFullNames(trending);
//   const registryTail = rankedRegistryFullNames(registry, max);
//   const candidates = unionOrderedFullNames(trendingNames, registryTail).slice(0, max);
//
// Pure: no IO, no side effects. The fetcher orchestrates the
// readDataStore() calls + comparator choices.

/**
 * Subset of the RegistryEntry shape we read (full shape lives in
 * `apps/trendingrepo-worker/src/fetchers/repo-registry/index.ts`).
 * Defining it locally keeps the helper independent of the fetcher
 * module — important because some callers import this file but not the
 * registry fetcher itself.
 */
export interface RegistryEntryLite {
  fullName: string;
  lastSeenAt: string;
}

export interface RegistryPayloadLite {
  repos?: Record<string, RegistryEntryLite>;
}

/**
 * Return up to `limit` fullNames from the registry, ordered by
 * `lastSeenAt`. Skips malformed entries.
 *
 * `order` controls direction:
 *   - 'desc' (default) — most recently seen first. Use for freshness-
 *     prioritised enrichment when on-demand traffic already covers the
 *     visible trending tier.
 *   - 'asc' — oldest seen first. Use for enrichment that targets the
 *     dropped tail (e.g. community-profile, star-activity for the
 *     registry-only repos that never get visited).
 *
 * Pure.
 */
export function rankedRegistryFullNames(
  registry: RegistryPayloadLite | null | undefined,
  limit: number,
  order: 'desc' | 'asc' = 'desc',
): string[] {
  const entries = Object.values(registry?.repos ?? {}).filter(
    (e): e is RegistryEntryLite =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as RegistryEntryLite).fullName === 'string' &&
      (e as RegistryEntryLite).fullName.includes('/') &&
      typeof (e as RegistryEntryLite).lastSeenAt === 'string',
  );
  const dir = order === 'asc' ? 1 : -1;
  entries.sort((a, b) => {
    if (a.lastSeenAt < b.lastSeenAt) return -1 * dir;
    if (a.lastSeenAt > b.lastSeenAt) return 1 * dir;
    // Tiebreaker by fullName (case-insensitive): repo-registry's hourly
    // tick updates ~700 repos to the SAME timestamp, so without a
    // tiebreaker the sort is non-deterministic — picking up the same
    // first-100 every run by JS-implementation-specific quirk and never
    // reaching the rest of the equal-timestamp block. Stable name sort
    // means the selection rotates predictably as new repos are added.
    const aN = a.fullName.toLowerCase();
    const bN = b.fullName.toLowerCase();
    return aN < bN ? -1 : aN > bN ? 1 : 0;
  });
  return entries.slice(0, limit).map((e) => e.fullName);
}

/**
 * Union an arbitrary number of ordered fullName lists, dedupe by
 * lowercased fullName, preserve first-occurrence order across lists.
 *
 * Typical use:
 *   unionOrderedFullNames(
 *     trendingFullNames,   // highest priority — appears in trending now
 *     recentFullNames,     // medium — discovered recently
 *     registryTailNames,   // tail — every repo ever seen
 *   ).slice(0, MAX);
 *
 * Rows with empty / non-string names are dropped.
 *
 * Pure.
 */
export function unionOrderedFullNames(
  ...lists: ReadonlyArray<readonly string[]>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      if (typeof raw !== 'string') continue;
      const fullName = raw.trim();
      if (!fullName.includes('/')) continue;
      const key = fullName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(fullName);
    }
  }
  return out;
}

/**
 * Convenience extractor for the canonical oss-trending payload shape
 * (the most common trending source). Returns ordered fullNames from the
 * `past_24_hours.All` bucket. Empty array on missing/malformed input.
 *
 * Pure.
 */
export function extractTrendingFullNames(
  trending:
    | { buckets?: Record<string, Record<string, Array<{ repo_name?: string }>>> }
    | null
    | undefined,
): string[] {
  const rows = trending?.buckets?.past_24_hours?.All ?? [];
  const out: string[] = [];
  for (const row of rows) {
    const fullName = row?.repo_name;
    if (typeof fullName === 'string' && fullName.includes('/')) {
      out.push(fullName);
    }
  }
  return out;
}
