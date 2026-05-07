/**
 * Source overrides — boot-time loader for runtime state of registered sources.
 *
 * Move 1, Phase 2 of the Source Platform migration. Static fields live in
 * `sources.json` (PR #326); runtime state (paused / deprecated / paused_until)
 * lives in the Supabase `source_overrides` table (migration 0002). This module
 * loads the overrides at boot, refreshes them every 60s in the background, and
 * exposes pure helpers for `schedule.ts` and `/healthz` to consume.
 *
 * Boot-path contract — never refuses to start:
 *   1. Try Supabase with a 2-second timeout.
 *   2. Success → write `.cache/source-overrides.json` (atomic temp + rename).
 *   3. DB failure / timeout → read the cache file (last-known-good).
 *   4. No cache → empty Map (assume all sources active).
 *
 * Filter semantics:
 *   - state = 'paused' AND (paused_until IS NULL OR paused_until > now()) → skip
 *   - state = 'paused' AND paused_until <= now() → keep (pause expired)
 *   - state = 'deprecated' → skip
 *   - state = 'active' → keep
 *   - no override row → keep
 *
 * Ghost detection:
 *   A ghost override is a row whose source_id is NOT in the current
 *   `FETCHERS[]` AND NOT in the static `SOURCE_CONTRACTS[]` registry. These
 *   are surfaced via /healthz so the reaper job (Move 1 step 4) has a target
 *   list. Source ids that appear in `SOURCE_CONTRACTS[]` but not `FETCHERS[]`
 *   are NOT ghosts — they're the 17 standalone scripts and 3 user-input flows.
 *
 * See:
 *   - docs/SOURCE-REGISTRY-PROPOSAL.md §4 (loader pseudocode)
 *   - supabase/migrations/0002_source_overrides.sql (schema)
 *   - apps/trendingrepo-worker/src/schedule.ts (consumer)
 *   - apps/trendingrepo-worker/src/server.ts (/healthz consumer)
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getDb } from '../lib/db.js';
import { getLogger } from '../lib/log.js';
import type { Fetcher } from '../lib/types.js';
import type { SourceContract } from './source-contract.js';

export interface SourceOverride {
  source_id: string;
  state: 'active' | 'paused' | 'deprecated';
  paused_until: string | null;
  reason: string;
}

const CACHE_PATH = resolve(process.cwd(), '.cache', 'source-overrides.json');
const LOAD_TIMEOUT_MS = 2_000;
const REFRESH_INTERVAL_MS_DEFAULT = 60_000;

let cachedOverrides: Map<string, SourceOverride> = new Map();
let refreshTimer: NodeJS.Timeout | null = null;

/**
 * Load overrides from Supabase with a 2-second timeout, fall back to the
 * on-disk cache, then to an empty Map. Always resolves; never throws. Updates
 * the module-level `cachedOverrides` so synchronous helpers see the new state.
 */
export async function loadOverrides(): Promise<Map<string, SourceOverride>> {
  const log = getLogger();
  const t0 = Date.now();
  try {
    const rows = await Promise.race<SourceOverride[]>([
      loadFromDb(),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('source-overrides-load-timeout')), LOAD_TIMEOUT_MS),
      ),
    ]);
    cachedOverrides = new Map(rows.map((r) => [r.source_id, r]));
    writeCacheAtomic(rows);
    log.info(
      { count: rows.length, durationMs: Date.now() - t0, source: 'db' },
      'source overrides loaded',
    );
    return cachedOverrides;
  } catch (err) {
    log.warn(
      { err: (err as Error).message, durationMs: Date.now() - t0 },
      'source overrides db load failed; falling back to cache',
    );
    const fromCache = readCache();
    if (fromCache) {
      cachedOverrides = new Map(fromCache.map((r) => [r.source_id, r]));
      log.info(
        { count: fromCache.length, source: 'cache' },
        'source overrides loaded from cache',
      );
      return cachedOverrides;
    }
    cachedOverrides = new Map();
    log.warn('no source overrides cache present; assuming all sources active');
    return cachedOverrides;
  }
}

async function loadFromDb(): Promise<SourceOverride[]> {
  const db = getDb();
  const { data, error } = await db
    .from('source_overrides')
    .select('source_id, state, paused_until, reason')
    .neq('state', 'active');
  if (error) throw new Error(`supabase: ${error.message}`);
  return (data ?? []) as SourceOverride[];
}

function writeCacheAtomic(rows: SourceOverride[]): void {
  try {
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    const tmp = `${CACHE_PATH}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(rows), 'utf8');
    renameSync(tmp, CACHE_PATH);
  } catch (err) {
    getLogger().warn(
      { err: (err as Error).message, path: CACHE_PATH },
      'source overrides cache write failed',
    );
  }
}

function readCache(): SourceOverride[] | null {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    const raw = readFileSync(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as SourceOverride[];
    return Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    getLogger().warn(
      { err: (err as Error).message, path: CACHE_PATH },
      'source overrides cache read failed',
    );
    return null;
  }
}

/**
 * Pure: filter a fetcher list against an overrides map. Returns a NEW array;
 * does not mutate the input. Used by `schedule.ts` before croner registration.
 */
export function applyOverrides(
  fetchers: Fetcher[],
  overrides: Map<string, SourceOverride>,
): Fetcher[] {
  const now = Date.now();
  return fetchers.filter((f) => !shouldSkip(overrides.get(f.name), now));
}

function shouldSkip(override: SourceOverride | undefined, nowMs: number): boolean {
  if (!override) return false;
  if (override.state === 'deprecated') return true;
  if (override.state === 'paused') {
    if (override.paused_until == null) return true;
    return new Date(override.paused_until).getTime() > nowMs;
  }
  return false; // 'active'
}

/**
 * Pure: which override source_ids no longer correspond to any fetcher OR
 * static contract row? These are true ghosts — code-side deletions that left
 * the DB row orphaned. The reaper job (Move 1 step 4) consumes this list.
 */
export function findGhostOverrides(
  fetchers: Fetcher[],
  overrides: Map<string, SourceOverride>,
  contracts: readonly SourceContract[],
): string[] {
  const known = new Set<string>();
  for (const f of fetchers) known.add(f.name);
  for (const c of contracts) known.add(c.id);
  return [...overrides.keys()].filter((id) => !known.has(id));
}

/**
 * Returns a per-state count summary for log lines and /healthz, computed
 * against the current cache (does NOT trigger a reload).
 */
export function summarizeOverrides(
  overrides: Map<string, SourceOverride>,
): { total: number; paused: number; deprecated: number } {
  let paused = 0;
  let deprecated = 0;
  for (const o of overrides.values()) {
    if (o.state === 'paused') paused++;
    else if (o.state === 'deprecated') deprecated++;
  }
  return { total: overrides.size, paused, deprecated };
}

/**
 * Synchronous accessor for the most recently loaded overrides map. Used by
 * /healthz to surface ghost rows without re-querying the DB on every probe.
 */
export function getCachedOverrides(): Map<string, SourceOverride> {
  return cachedOverrides;
}

/**
 * Background refresh — re-runs `loadOverrides()` every `intervalMs` (default
 * 60s). Returns a stop function. Errors inside the refresh are swallowed by
 * `loadOverrides()` itself (it never throws), so the timer keeps ticking.
 */
export function startOverrideRefresh(
  intervalMs: number = REFRESH_INTERVAL_MS_DEFAULT,
): () => void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  refreshTimer = setInterval(() => {
    void loadOverrides();
  }, intervalMs);
  // Don't keep the event loop alive on this timer alone — the cron scheduler
  // keeps it alive, and a stuck refresh shouldn't prevent shutdown.
  if (typeof refreshTimer.unref === 'function') refreshTimer.unref();
  return () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };
}
