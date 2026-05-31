// Mentions ledger reader — cumulative cross-source mention counts.
//
// PROBLEM
//   The original mentions architecture re-buckets a 7-day snapshot at read
//   time. When any collector goes stale, every `count24h` reads zero and the UI filter
//   (`count24h > 0`) drops the source pip from the table cell. Stable
//   per-mention IDs already exist on every signal, so the storage shape
//   was wrong — not the data.
//
// SOLUTION
//   A new worker fetcher writes per-(repo, source) Redis SETs at
//   `ss:mentions:v1:<owner>/<name>:<source>` (idempotent SADD by mention
//   id) plus an index hash at `:_index`. A side-car aggregator (deferred,
//   tracked in a follow-up ticket) flattens those into a single
//   `mentions-ledger` snapshot slug for fast read-side consumption.
//
//   This module is the read side. It mirrors the refresh-then-get pattern
//   from `src/lib/trending.ts` so every server component / route handler
//   can call `refreshMentionsLedgerFromStore()` once at the top and then
//   use sync getters in the rest of the file. Internal 30 s rate-limit +
//   in-flight dedupe make the refresh cheap to call on every render.
//
// GRACEFUL DEGRADATION
//   The aggregator slug doesn't exist yet. Until A1's fetcher fires + the
//   follow-up aggregator job lands, `readDataStore("mentions-ledger")`
//   returns null. The cache stays empty, `getMentionsLedger()` returns an
//   empty Map, and `getRepoMentionsLedger(name)` returns null. A7 (decorator
//   rewrite) reads this as "no ledger data" and falls back to legacy
//   windowed counts. No throw, no crash, no UI flicker.

import type { DataStore } from "./data-store";
import type { SocialPlatform } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One entry per repo in the ledger. `perSource` is a partial record because
 * a repo doesn't have to be mentioned on every platform; `sources` is the
 * ordered list (descending by count) of platforms with `count > 0` for fast
 * UI iteration without re-sorting at render time.
 */
export interface MentionsLedgerEntry {
  fullName: string;
  perSource: Partial<Record<SocialPlatform, number>>;
  total: number;
  sources: SocialPlatform[];
}

/**
 * Snapshot payload written by the deferred aggregator job. Shape pinned
 * here so A1 (fetcher) + A7 (decorator) + A9 (seed) all share the same
 * contract for what the read-side expects.
 */
export interface MentionsLedgerSnapshot {
  entries: MentionsLedgerEntry[];
  writtenAt: string;
}

// ---------------------------------------------------------------------------
// Module-local cache
// ---------------------------------------------------------------------------

const STORE_KEY = "mentions-ledger";
const MIN_REFRESH_INTERVAL_MS = 30_000;

// Mutable in-memory cache, keyed by lower-cased fullName for case-insensitive
// lookup. Empty by default; populated by refreshMentionsLedgerFromStore() when
// the aggregator slug exists in Redis.
let cache: Map<string, MentionsLedgerEntry> = new Map();
let lastRefreshMs = 0;
let inflight: Promise<void> | null = null;
// Snapshot writtenAt — exported as the data version so getDerivedRepos()'s
// cache key invalidates when a fresh ledger snapshot lands.
let lastWrittenAt = "";

// ---------------------------------------------------------------------------
// Refresh hook — pulls fresh ledger snapshot from the data-store.
// ---------------------------------------------------------------------------

/**
 * Pull the freshest `mentions-ledger` payload from the data-store and swap it
 * into the in-memory cache. Cheap to call multiple times — internal dedupe +
 * 30 s rate-limit ensure we hit Redis at most once per 30 s per process.
 *
 * Safe to call from any server-component / route handler before reading any
 * sync getter. Never throws — on Redis miss the existing cache is preserved.
 *
 * @param store Optional data-store override. Tests inject a fake here so the
 *              refresh path exercises a controlled payload without touching
 *              the singleton or hitting Redis. Production callers leave it
 *              undefined to use the process-wide singleton.
 */
export async function refreshMentionsLedgerFromStore(
  store?: DataStore,
): Promise<void> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return;
  }

  inflight = (async (): Promise<void> => {
    try {
      const target = store ?? (await import("./data-store")).getDataStore();
      const result = await target.read<MentionsLedgerSnapshot>(STORE_KEY);
      if (result.data && result.source !== "missing") {
        cache = buildCache(result.data.entries);
        lastWrittenAt = result.data.writtenAt ?? result.writtenAt ?? "";
      }
      // Total miss: leave the cache as-is. First-ever cold start that gets
      // a miss keeps the empty Map; subsequent refreshes will try again
      // after the rate-limit window.
      lastRefreshMs = Date.now();
    } catch {
      // Never throw — readers degrade gracefully on Redis brownouts. Stamp
      // lastRefreshMs so we don't hammer Redis with a tight retry loop.
      lastRefreshMs = Date.now();
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

function buildCache(
  entries: ReadonlyArray<MentionsLedgerEntry>,
): Map<string, MentionsLedgerEntry> {
  const next = new Map<string, MentionsLedgerEntry>();
  for (const entry of entries) {
    if (!entry?.fullName) continue;
    const perSource = entry.perSource ?? {};
    // Re-sort sources descending by count so UI consumers can render pips in
    // the canonical "most-mentioned first" order without re-sorting on each
    // render. Falls through to natural map insertion order on ties, which
    // matches Object.entries() iteration order in modern V8.
    const sources = (Object.keys(perSource) as SocialPlatform[])
      .filter((src) => (perSource[src] ?? 0) > 0)
      .sort((a, b) => (perSource[b] ?? 0) - (perSource[a] ?? 0));
    next.set(entry.fullName.toLowerCase(), {
      fullName: entry.fullName,
      perSource,
      total: entry.total ?? 0,
      sources,
    });
  }
  return next;
}

// ---------------------------------------------------------------------------
// Sync getters
// ---------------------------------------------------------------------------

/** Whole-ledger snapshot. Map key is lower-cased fullName. */
export function getMentionsLedger(): Map<string, MentionsLedgerEntry> {
  return cache;
}

/** Per-repo lookup. Case-insensitive on `fullName`. */
export function getRepoMentionsLedger(
  fullName: string,
): MentionsLedgerEntry | null {
  if (!fullName) return null;
  return cache.get(fullName.toLowerCase()) ?? null;
}

/** Data version (snapshot writtenAt) for derived-repos cache invalidation. */
export function getMentionsLedgerDataVersion(): string {
  return lastWrittenAt;
}

// ---------------------------------------------------------------------------
// Test-only — reset module state so each test starts from a clean cache.
// ---------------------------------------------------------------------------

export function _resetMentionsLedgerCacheForTests(): void {
  cache = new Map();
  lastRefreshMs = 0;
  inflight = null;
  lastWrittenAt = "";
}
