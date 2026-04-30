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

function emptyComponent(): ConsensusSourceComponent {
  return { present: false, rank: null, score: null, normalized: 0 };
}

// Forward-compat: the worker's consensus-v3 payload uses an expanded sources
// map (gh/hf/hn/x/r/pdh/dev/bs/ours) — the legacy oss/trendshift slots may be
// absent. Without this guard, the page renders `item.sources.oss.present` and
// crashes during SSR when the new shape arrives. Fill missing slots with
// emptyComponent so the page degrades to "−" placeholders cleanly.
function normalizeItem(input: unknown): ConsensusItem | null {
  if (!input || typeof input !== "object") return null;
  const it = input as Partial<ConsensusItem> & { sources?: unknown };
  if (typeof it.fullName !== "string" || !it.fullName.includes("/")) return null;
  const rawSources =
    it.sources && typeof it.sources === "object"
      ? (it.sources as Record<string, ConsensusSourceComponent | undefined>)
      : {};
  const sources: Record<ConsensusSource, ConsensusSourceComponent> = {
    ours: rawSources.ours ?? emptyComponent(),
    oss: rawSources.oss ?? emptyComponent(),
    trendshift: rawSources.trendshift ?? emptyComponent(),
  };
  return {
    fullName: it.fullName,
    rank: typeof it.rank === "number" ? it.rank : 0,
    consensusScore: typeof it.consensusScore === "number" ? it.consensusScore : 0,
    sourceCount: typeof it.sourceCount === "number" ? it.sourceCount : 0,
    badges: Array.isArray(it.badges) ? (it.badges as ConsensusBadge[]) : [],
    sources,
  };
}

function normalizePayload(input: unknown): ConsensusTrendingPayload {
  if (!input || typeof input !== "object") return EMPTY_PAYLOAD;
  const parsed = input as Partial<ConsensusTrendingPayload>;
  const items = Array.isArray(parsed.items)
    ? parsed.items.map(normalizeItem).filter((x): x is ConsensusItem => x !== null)
    : [];
  return {
    computedAt: typeof parsed.computedAt === "string" ? parsed.computedAt : "",
    itemCount: typeof parsed.itemCount === "number" ? parsed.itemCount : items.length,
    weights: parsed.weights ?? EMPTY_PAYLOAD.weights,
    items,
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
