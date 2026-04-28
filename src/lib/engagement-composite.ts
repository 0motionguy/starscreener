// Runtime reader for the engagement-composite Redis slug.
//
// Mirrors the lib/repo-profiles.ts pattern: a refreshFromStore() hook
// that pulls the freshest payload from the data-store into an in-memory
// cache (rate-limited to one Redis hit per 30s per process), plus
// synchronous getters that read whatever the cache last saw.
//
// Server components and route handlers should call refreshEngagement-
// CompositeFromStore() once at the top of the request, then use the
// sync getters in the rest of the file. The hook is cheap to call
// repeatedly because of the in-flight dedupe + cooldown.

import { getDataStore } from "./data-store";

// ---------------------------------------------------------------------------
// Payload contract — kept in lockstep with
// apps/trendingrepo-worker/src/fetchers/engagement-composite/types.ts.
// Component keys MUST match the WEIGHTS object on the worker side.
// ---------------------------------------------------------------------------

export type EngagementComponentKey =
  | "hn"
  | "reddit"
  | "bluesky"
  | "devto"
  | "npm"
  | "ghStars"
  | "ph";

export interface EngagementComponentScore {
  raw: number;
  normalized: number;
}

export interface EngagementCompositeItem {
  fullName: string;
  rank: number;
  compositeScore: number;
  components: Record<EngagementComponentKey, EngagementComponentScore>;
}

export interface EngagementCompositePayload {
  computedAt: string;
  cohortSize: number;
  itemCount: number;
  weights: Record<EngagementComponentKey, number>;
  items: EngagementCompositeItem[];
}

const EMPTY_PAYLOAD: EngagementCompositePayload = {
  computedAt: "",
  cohortSize: 0,
  itemCount: 0,
  weights: {
    hn: 0, reddit: 0, bluesky: 0, devto: 0, npm: 0, ghStars: 0, ph: 0,
  },
  items: [],
};

// ---------------------------------------------------------------------------
// Cache + refresh hook
// ---------------------------------------------------------------------------

interface CacheEntry {
  payload: EngagementCompositePayload;
  source: "redis" | "file" | "memory" | "missing";
  writtenAt: string | null;
  ageMs: number;
}

let cache: CacheEntry | null = null;
let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export interface RefreshResult {
  source: "redis" | "file" | "memory" | "missing";
  ageMs: number;
  writtenAt: string | null;
}

function normalizePayload(input: unknown): EngagementCompositePayload {
  if (!input || typeof input !== "object") return EMPTY_PAYLOAD;
  const parsed = input as Partial<EngagementCompositePayload>;
  return {
    computedAt: typeof parsed.computedAt === "string" ? parsed.computedAt : "",
    cohortSize: typeof parsed.cohortSize === "number" ? parsed.cohortSize : 0,
    itemCount: typeof parsed.itemCount === "number" ? parsed.itemCount : 0,
    weights: parsed.weights ?? EMPTY_PAYLOAD.weights,
    items: Array.isArray(parsed.items) ? parsed.items : [],
  };
}

/**
 * Pull the freshest engagement-composite payload from the data-store and
 * swap it into the in-memory cache. Cheap to call on every request — the
 * 30s cooldown + in-flight dedupe ensure at most one Redis hit per
 * 30s per process.
 *
 * Never throws — on Redis miss the existing cache is preserved.
 */
export async function refreshEngagementCompositeFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return {
      source: cache?.source ?? "memory",
      ageMs: cache?.ageMs ?? 0,
      writtenAt: cache?.writtenAt ?? null,
    };
  }

  inflight = (async (): Promise<RefreshResult> => {
    try {
      const store = getDataStore();
      const result = await store.read<unknown>("engagement-composite");
      if (result.data && result.source !== "missing") {
        cache = {
          payload: normalizePayload(result.data),
          source: result.source,
          writtenAt: result.writtenAt ?? null,
          ageMs: result.ageMs,
        };
      }
      lastRefreshMs = Date.now();
      return {
        source: result.source,
        ageMs: result.ageMs,
        writtenAt: result.writtenAt ?? null,
      };
    } catch {
      lastRefreshMs = Date.now();
      return {
        source: cache?.source ?? "missing",
        ageMs: cache?.ageMs ?? 0,
        writtenAt: cache?.writtenAt ?? null,
      };
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

// ---------------------------------------------------------------------------
// Sync getters
// ---------------------------------------------------------------------------

export function getEngagementCompositePayload(): EngagementCompositePayload {
  return cache?.payload ?? EMPTY_PAYLOAD;
}

export function getEngagementCompositeItems(limit?: number): EngagementCompositeItem[] {
  const items = cache?.payload.items ?? [];
  if (typeof limit === "number" && limit >= 0 && limit < items.length) {
    return items.slice(0, limit);
  }
  return items;
}

export function getEngagementCompositeMeta(): {
  computedAt: string;
  cohortSize: number;
  itemCount: number;
  source: "redis" | "file" | "memory" | "missing";
  writtenAt: string | null;
  ageSeconds: number;
} {
  const payload = cache?.payload ?? EMPTY_PAYLOAD;
  return {
    computedAt: payload.computedAt,
    cohortSize: payload.cohortSize,
    itemCount: payload.itemCount,
    source: cache?.source ?? "missing",
    writtenAt: cache?.writtenAt ?? null,
    ageSeconds: cache ? Math.max(0, Math.floor(cache.ageMs / 1000)) : 0,
  };
}

/**
 * Test-only — drop the in-memory cache so the next read goes to Redis.
 */
export function _resetEngagementCompositeCacheForTests(): void {
  cache = null;
  lastRefreshMs = 0;
  inflight = null;
}
