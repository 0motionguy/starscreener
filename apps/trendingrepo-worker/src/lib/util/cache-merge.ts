// Shared cache-merge primitive: encodes the "keep last-N, never empty the
// cache" rule (docs/INGESTION.md § 2026-05-08) for worker fetchers in one
// place. Mirrors the pattern proven by `repo-registry` and `recent-repos`.
//
// Why this exists: before 2026-05-27 every fetcher rolled its own merge
// loop, and recent-repos (and likely others — A3 audit will enumerate)
// silently overwrote prior data when all upstream calls failed, zeroing
// the user-visible cache. Centralising the pattern (a) makes the rule
// enforceable, (b) lets new fetchers opt in by import rather than by
// careful re-implementation, (c) gives a single place to test the
// invariants once.
//
// API at a glance:
//   - mergeAndCap({ existing, fresh, key, compare, max })
//       → returns the merged array (fresh overlays existing, sorted, capped).
//
//   - shouldPreserveCache({ fresh, existing })
//       → true when fresh is empty AND existing has rows (the zero-write
//         guard signal); the fetcher decides whether to short-circuit on
//         it (typical pattern: short-circuit AND log a WARN AND keep
//         fetchedAt moving so freshness probes see motion).
//
// Pure functions — no side effects, no IO, no logger. Caller orchestrates
// readDataStore/writeDataStore around them.

/**
 * Compare two rows of type T and return true when `a` should sort BEFORE
 * `b` (the standard JS comparator returning a negative number). The merge
 * helper sorts descending using your comparator — i.e. the row your
 * comparator considers "smaller" appears later. Typical pattern: return
 * `b.createdAt - a.createdAt` (newest first).
 */
export type RowCompare<T> = (a: T, b: T) => number;

/**
 * Extract a stable, case-insensitive key from a row. Rows with the same
 * key collide; the fresh row wins.
 *
 * Return `null` or empty string to skip the row entirely (defensive: lets
 * the caller drop malformed inputs without polluting the merged set).
 */
export type RowKey<T> = (row: T) => string | null;

export interface MergeAndCapOptions<T> {
  /** Rows from the prior cache (read this run). */
  existing: readonly T[];
  /** Rows fetched this run. */
  fresh: readonly T[];
  /** Stable key extractor (case-folded by the caller if desired). */
  key: RowKey<T>;
  /** Sort comparator (descending — see RowCompare). */
  compare: RowCompare<T>;
  /** Cap after merge + sort. */
  max: number;
}

/**
 * Merge fresh rows into the existing cache, dedupe by `key` (fresh wins on
 * collision), sort by `compare`, cap at `max`.
 *
 * Guarantees:
 *   - When `fresh` is non-empty, prior rows survive unless they collide
 *     OR they get evicted by the cap.
 *   - When `fresh` is empty AND `existing` has rows, returns `existing`
 *     sorted + capped — i.e. the cache is preserved. Pair with
 *     `shouldPreserveCache` for an explicit zero-write guard upstream.
 *   - Rows whose key returns null/'' are dropped (defensive).
 *
 * Pure: no IO, no side effects.
 */
export function mergeAndCap<T>(opts: MergeAndCapOptions<T>): T[] {
  const map = new Map<string, T>();
  for (const row of opts.existing) {
    const k = opts.key(row);
    if (k) map.set(k, row);
  }
  // Fresh rows overlay — newest stats win on key collision.
  for (const row of opts.fresh) {
    const k = opts.key(row);
    if (k) map.set(k, row);
  }
  return Array.from(map.values()).sort(opts.compare).slice(0, opts.max);
}

/**
 * The zero-write hazard signal: fresh is empty AND existing has rows.
 *
 * When true, callers should preserve the prior payload (touch `fetchedAt`,
 * log a WARN with errors[], skip the merge). This avoids the recent-repos
 * class of regression where all upstream windows error and the cache is
 * silently zeroed.
 *
 * Pre-mortem: a permanent upstream outage would freeze the payload until a
 * manual reset; that's preferable to silently emptying the cache. The WARN
 * + errors[] surface the problem to the operator via the run-summary.
 */
export function shouldPreserveCache<T>(args: {
  fresh: readonly T[];
  existing: readonly T[];
}): boolean {
  return args.fresh.length === 0 && args.existing.length > 0;
}

/**
 * Convenience: case-insensitive key extractor for a string field. Returns
 * an empty string for missing/non-string values so the row is dropped.
 *
 * Example:
 *   key: caseInsensitiveKey<MyRow>('fullName')
 */
export function caseInsensitiveKey<T>(field: keyof T): RowKey<T> {
  return (row: T): string => {
    const v = row[field];
    return typeof v === 'string' ? v.toLowerCase() : '';
  };
}
