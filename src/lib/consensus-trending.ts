import { getDataStore } from "./data-store";

export type ConsensusSource = "ours" | "oss" | "trendshift";

export type ConsensusBadge =
  | "consensus_pick"
  | "our_early_signal"
  | "external_breakout"
  | "divergence";

export interface ConsensusSourceComponent {
  present: boolean;
  rank: number | null;
  score: number | null;
  normalized: number;
}

export interface ConsensusItem {
  fullName: string;
  rank: number;
  consensusScore: number;
  sourceCount: number;
  badges: ConsensusBadge[];
  sources: Record<ConsensusSource, ConsensusSourceComponent>;
}

export interface ConsensusTrendingPayload {
  computedAt: string;
  itemCount: number;
  weights: Record<ConsensusSource, number>;
  items: ConsensusItem[];
}

const EMPTY_PAYLOAD: ConsensusTrendingPayload = {
  computedAt: "",
  itemCount: 0,
  weights: {
    ours: 0.45,
    oss: 0.25,
    trendshift: 0.30,
  },
  items: [],
};

interface CacheEntry {
  payload: ConsensusTrendingPayload;
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

function normalizePayload(input: unknown): ConsensusTrendingPayload {
  if (!input || typeof input !== "object") return EMPTY_PAYLOAD;
  const parsed = input as Partial<ConsensusTrendingPayload>;
  return {
    computedAt: typeof parsed.computedAt === "string" ? parsed.computedAt : "",
    itemCount: typeof parsed.itemCount === "number" ? parsed.itemCount : 0,
    weights: parsed.weights ?? EMPTY_PAYLOAD.weights,
    items: Array.isArray(parsed.items) ? parsed.items : [],
  };
}

export async function refreshConsensusTrendingFromStore(): Promise<RefreshResult> {
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
      const result = await store.read<unknown>("consensus-trending");
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

export function getConsensusTrendingItems(limit?: number): ConsensusItem[] {
  const items = cache?.payload.items ?? [];
  if (typeof limit === "number" && limit >= 0 && limit < items.length) {
    return items.slice(0, limit);
  }
  return items;
}

export function getConsensusTrendingMeta(): {
  computedAt: string;
  itemCount: number;
  source: "redis" | "file" | "memory" | "missing";
  writtenAt: string | null;
  ageSeconds: number;
} {
  const payload = cache?.payload ?? EMPTY_PAYLOAD;
  return {
    computedAt: payload.computedAt,
    itemCount: payload.itemCount,
    source: cache?.source ?? "missing",
    writtenAt: cache?.writtenAt ?? null,
    ageSeconds: cache ? Math.max(0, Math.floor(cache.ageMs / 1000)) : 0,
  };
}

export function _resetConsensusTrendingCacheForTests(): void {
  cache = null;
  lastRefreshMs = 0;
  inflight = null;
}
