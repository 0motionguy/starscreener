// StarScreener Pipeline — shared singleton store instances
//
// API routes, query services, the ingestion pipeline, and tests all share
// state by importing these singletons. Tests can reset state via the stores'
// own clear() / delete APIs or by swapping modules.
//
// `hydrateAll()` and `persistAll()` are the canonical entry points for
// the file-backed layer — pipeline.ts wires them into its seed/recompute
// flow so a server restart loads prior state transparently.
//
// In addition, this module installs a debounced persist hook on the shared
// store-mutation callback so any mutator anywhere in the pipeline schedules
// a flush within `PERSIST_DEBOUNCE_MS` of the most recent change. Multiple
// mutations coalesce into one write; the debounce resets on each mutation
// so a burst of updates produces at most one disk I/O once the burst ends.

import {
  InMemoryAlertEventStore,
  InMemoryAlertRuleStore,
  InMemoryCategoryStore,
  InMemoryMentionStore,
  InMemoryReasonStore,
  InMemoryRepoStore,
  InMemoryScoreStore,
  InMemorySnapshotStore,
  setStoreMutationHook,
} from "./memory-stores";
import { createDebouncedPersist } from "./debounced-persist";
import {
  ensureDataDir,
  isPersistenceEnabled,
} from "./file-persistence";

export const repoStore = new InMemoryRepoStore();
export const snapshotStore = new InMemorySnapshotStore();
export const scoreStore = new InMemoryScoreStore();
export const categoryStore = new InMemoryCategoryStore();
export const reasonStore = new InMemoryReasonStore();
export const mentionStore = new InMemoryMentionStore();
export const alertRuleStore = new InMemoryAlertRuleStore();
export const alertEventStore = new InMemoryAlertEventStore();

/**
 * Bundle of all shared stores — useful when a helper wants to accept the
 * whole pipeline storage layer as a single argument (e.g., seed scripts).
 */
export const stores = {
  repoStore,
  snapshotStore,
  scoreStore,
  categoryStore,
  reasonStore,
  mentionStore,
  alertRuleStore,
  alertEventStore,
} as const;

export type PipelineStores = typeof stores;

// ---------------------------------------------------------------------------
// Hydration / persistence orchestration
// ---------------------------------------------------------------------------

let hydratePromise: Promise<void> | null = null;

/**
 * Load any previously-persisted state from disk into the singleton stores.
 *
 * Idempotent — concurrent callers share a single in-flight promise. Returns
 * immediately (resolving to `void`) when persistence is disabled via
 * `STARSCREENER_PERSIST=false`.
 */
export async function hydrateAll(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    if (!isPersistenceEnabled()) return;
    await ensureDataDir();
    // Temporarily suppress the mutation hook — hydration fires many mutator
    // calls to rebuild state and we don't want each one to schedule a flush.
    suspendPersistHook();
    try {
      await Promise.all([
        repoStore.hydrate(),
        snapshotStore.hydrate(),
        scoreStore.hydrate(),
        categoryStore.hydrate(),
        reasonStore.hydrate(),
        mentionStore.hydrate(),
        alertRuleStore.hydrate(),
        alertEventStore.hydrate(),
      ]);
    } finally {
      restorePersistHook();
    }
  })();
  return hydratePromise;
}

/**
 * Refresh only alert rules/events from disk.
 *
 * These stores are user-configured and can mutate independently of the main
 * repo corpus. Re-hydrating them per request keeps multiple server workers
 * consistent after alert mutations.
 */
export async function hydrateAlertStores(): Promise<void> {
  if (!isPersistenceEnabled()) return;
  await ensureDataDir();
  suspendPersistHook();
  try {
    await Promise.all([alertRuleStore.hydrate(), alertEventStore.hydrate()]);
  } finally {
    restorePersistHook();
  }
}

/**
 * Flush every store to disk in parallel. No-op when persistence is disabled.
 */
export async function persistAll(): Promise<void> {
  if (!isPersistenceEnabled()) return;
  await ensureDataDir();
  await Promise.all([
    repoStore.persist(),
    snapshotStore.persist(),
    scoreStore.persist(),
    categoryStore.persist(),
    reasonStore.persist(),
    mentionStore.persist(),
    alertRuleStore.persist(),
    alertEventStore.persist(),
  ]);
}

// ---------------------------------------------------------------------------
// Debounced persist — fires at most once per quiet window after mutations.
// ---------------------------------------------------------------------------

/** How long to wait after the last mutation before flushing to disk. */
export const PERSIST_DEBOUNCE_MS = 2000;

// Pipeline-side debounce handle. The factory owns the timer + the
// suspend/clear/flush primitives; we re-export the names the rest of the
// codebase has been calling for years.
const pipelinePersist = createDebouncedPersist({
  flush: () => persistAll(),
  debounceMs: PERSIST_DEBOUNCE_MS,
  label: "pipeline",
});

/**
 * Schedule a persist flush `delayMs` milliseconds from now. Additional calls
 * reset the timer so a burst of mutations produces at most one disk write
 * after the burst settles. No-op when persistence is disabled.
 */
export function schedulePersist(delayMs: number = PERSIST_DEBOUNCE_MS): void {
  pipelinePersist.schedule(delayMs);
}

/** Cancel any pending debounced persist (useful in tests). */
export function cancelScheduledPersist(): void {
  pipelinePersist.cancel();
}

/**
 * Flush any pending debounced persist immediately and await completion.
 * When no persist is queued, this resolves after one tick so callers can
 * uniformly `await` before a clean shutdown.
 */
export async function flushPendingPersist(): Promise<void> {
  await pipelinePersist.flush();
}

// Install the debounced persist as the default store-mutation hook. Once set,
// every mutator in every singleton store nudges the timer forward.
setStoreMutationHook(schedulePersist);

// Helpers to suspend/restore the hook around bulk-load operations (hydrate,
// test fixtures, recomputeAll). Internal callers in this module use them
// directly via try/finally; external callers should prefer the
// withSuspendedPersistHook wrapper below for the standard guarantees.
function suspendPersistHook(): void {
  setStoreMutationHook(null);
}
function restorePersistHook(): void {
  setStoreMutationHook(schedulePersist);
}

/**
 * Run `fn` with the per-mutation persist hook suspended, then restore the
 * hook and schedule exactly one persist flush. Saves N hook invocations
 * during a bulk pass — the audit's LIB-11 win for `recomputeAll`'s upsert
 * loop, which previously fired schedulePersist() once per repo (1k+
 * debounce-resets per recompute).
 *
 * Synchronous variant: callers passing a sync function get the result back.
 * For async bulk passes use the awaited form by typing fn as () => Promise<T>.
 */
export function withSuspendedPersistHook<T>(fn: () => T): T {
  suspendPersistHook();
  try {
    return fn();
  } finally {
    restorePersistHook();
    // Trigger exactly one debounced flush after the bulk pass. This is the
    // whole point of the wrapper — N writes collapse to 1 schedule.
    schedulePersist();
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Test helper — resets the memoized hydrate promise so a test suite can
 * exercise hydration twice in the same process.
 */
export function __resetHydrateGuardForTests(): void {
  hydratePromise = null;
}
