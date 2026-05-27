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
 * `lastSeenAt` descending (most recently seen first). Skips malformed
 * entries.
 *
 * The order matters: callers typically want freshness-prioritised
 * enrichment so visible-in-trending repos refresh before the tail.
 *
 * Pure.
 */
export function rankedRegistryFullNames(
  registry: RegistryPayloadLite | null | undefined,
  limit: number,
): string[] {
  const entries = Object.values(registry?.repos ?? {}).filter(
    (e): e is RegistryEntryLite =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as RegistryEntryLite).fullName === 'string' &&
      (e as RegistryEntryLite).fullName.includes('/') &&
      typeof (e as RegistryEntryLite).lastSeenAt === 'string',
  );
  entries.sort((a, b) =>
    b.lastSeenAt < a.lastSeenAt ? -1 : b.lastSeenAt > a.lastSeenAt ? 1 : 0,
  );
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
