import { createPayloadReader } from "./data-store-reader";

export type ConsensusInternalSource = "ours";
export type ConsensusExternalSource =
  | "gh"
  | "hf"
  | "hn"
  | "x"
  | "r"
  | "pdh"
  | "dev"
  | "bs";
export type ConsensusSource = ConsensusInternalSource | ConsensusExternalSource;

export type ConsensusVerdictBand =
  | "strong_consensus"
  | "early_call"
  | "divergence"
  | "external_only"
  | "single_source";

/**
 * Legacy 3-source badge union, kept exported so old call-sites compile while
 * we migrate. New code should read `verdict` instead. Marked deprecated; the
 * worker no longer emits these on fresh payloads.
 * @deprecated Use ConsensusVerdictBand
 */
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
  /** 0–100. weight_sum_of_present_sources × concordance_factor × 100. */
  confidence: number;
  /** Count of external sources present (0–8). */
  sourceCount: number;
  externalRank: number | null;
  oursRank: number | null;
  maxRankGap: number;
  verdict: ConsensusVerdictBand;
  /** Legacy 3-source badge list. Empty on v3 payloads. */
  badges: ConsensusBadge[];
  sources: Record<ConsensusSource, ConsensusSourceComponent>;
}

export const EXTERNAL_SOURCES: readonly ConsensusExternalSource[] = [
  "gh",
  "hf",
  "hn",
  "x",
  "r",
  "pdh",
  "dev",
  "bs",
] as const;

export const DEFAULT_WEIGHTS: Record<ConsensusExternalSource, number> = {
  gh: 0.20,
  hf: 0.18,
  hn: 0.16,
  x: 0.14,
  r: 0.10,
  pdh: 0.08,
  dev: 0.08,
  bs: 0.06,
};

export interface ConsensusTrendingPayload {
  computedAt: string;
  itemCount: number;
  weights: Record<ConsensusExternalSource, number>;
  sourceStats: Record<ConsensusExternalSource, { count: number; rows: number }>;
  bandCounts: Record<ConsensusVerdictBand, number>;
  items: ConsensusItem[];
}

const EMPTY_STATS: Record<ConsensusExternalSource, { count: number; rows: number }> = {
  gh: { count: 0, rows: 0 },
  hf: { count: 0, rows: 0 },
  hn: { count: 0, rows: 0 },
  x: { count: 0, rows: 0 },
  r: { count: 0, rows: 0 },
  pdh: { count: 0, rows: 0 },
  dev: { count: 0, rows: 0 },
  bs: { count: 0, rows: 0 },
};

const EMPTY_BAND_COUNTS: Record<ConsensusVerdictBand, number> = {
  strong_consensus: 0,
  early_call: 0,
  divergence: 0,
  external_only: 0,
  single_source: 0,
};

const EMPTY_PAYLOAD: ConsensusTrendingPayload = {
  computedAt: "",
  itemCount: 0,
  weights: DEFAULT_WEIGHTS,
  sourceStats: EMPTY_STATS,
  bandCounts: EMPTY_BAND_COUNTS,
  items: [],
};

export interface RefreshResult {
  source: "redis" | "file" | "memory" | "missing";
  ageMs: number;
  writtenAt: string | null;
}

const ALL_SOURCE_KEYS: readonly ConsensusSource[] = [
  "ours",
  ...EXTERNAL_SOURCES,
];

function emptyComponent(): ConsensusSourceComponent {
  return { present: false, rank: null, score: null, normalized: 0 };
}

function normalizeSourceMap(input: unknown): Record<ConsensusSource, ConsensusSourceComponent> {
  const out = {} as Record<ConsensusSource, ConsensusSourceComponent>;
  for (const k of ALL_SOURCE_KEYS) {
    out[k] = emptyComponent();
  }
  if (!input || typeof input !== "object") return out;
  const map = input as Record<string, Partial<ConsensusSourceComponent>>;
  for (const k of ALL_SOURCE_KEYS) {
    const c = map[k];
    if (c && typeof c === "object") {
      out[k] = {
        present: Boolean(c.present),
        rank: typeof c.rank === "number" ? c.rank : null,
        score: typeof c.score === "number" ? c.score : null,
        normalized: typeof c.normalized === "number" ? c.normalized : 0,
      };
    }
  }
  return out;
}

function asVerdictBand(value: unknown): ConsensusVerdictBand {
  if (
    value === "strong_consensus" ||
    value === "early_call" ||
    value === "divergence" ||
    value === "external_only" ||
    value === "single_source"
  ) {
    return value;
  }
  return "single_source";
}

function normalizeItem(input: unknown): ConsensusItem | null {
  if (!input || typeof input !== "object") return null;
  const it = input as Partial<ConsensusItem> & {
    sources?: unknown;
    verdict?: unknown;
    badges?: unknown;
  };
  if (typeof it.fullName !== "string" || !it.fullName.includes("/")) return null;
  return {
    fullName: it.fullName,
    rank: typeof it.rank === "number" ? it.rank : 0,
    consensusScore: typeof it.consensusScore === "number" ? it.consensusScore : 0,
    confidence: typeof it.confidence === "number" ? it.confidence : 0,
    sourceCount: typeof it.sourceCount === "number" ? it.sourceCount : 0,
    externalRank:
      typeof it.externalRank === "number" || it.externalRank === null
        ? (it.externalRank as number | null)
        : null,
    oursRank:
      typeof it.oursRank === "number" || it.oursRank === null
        ? (it.oursRank as number | null)
        : null,
    maxRankGap: typeof it.maxRankGap === "number" ? it.maxRankGap : 0,
    verdict: asVerdictBand(it.verdict),
    badges: Array.isArray(it.badges) ? (it.badges as ConsensusBadge[]) : [],
    sources: normalizeSourceMap(it.sources),
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
    weights:
      parsed.weights && typeof parsed.weights === "object"
        ? { ...DEFAULT_WEIGHTS, ...parsed.weights }
        : DEFAULT_WEIGHTS,
    sourceStats:
      parsed.sourceStats && typeof parsed.sourceStats === "object"
        ? { ...EMPTY_STATS, ...parsed.sourceStats }
        : EMPTY_STATS,
    bandCounts:
      parsed.bandCounts && typeof parsed.bandCounts === "object"
        ? { ...EMPTY_BAND_COUNTS, ...parsed.bandCounts }
        : EMPTY_BAND_COUNTS,
    items,
  };
}

const reader = createPayloadReader<ConsensusTrendingPayload>({
  key: "consensus-trending",
  emptyPayload: EMPTY_PAYLOAD,
  normalize: normalizePayload,
});

export const refreshConsensusTrendingFromStore = reader.refresh;

export function getConsensusTrendingItems(limit?: number): ConsensusItem[] {
  const items = reader.getPayload().items;
  if (typeof limit === "number" && limit >= 0 && limit < items.length) {
    return items.slice(0, limit);
  }
  return items;
}

export const getConsensusTrendingPayload = reader.getPayload;

export function getConsensusTrendingMeta(): {
  computedAt: string;
  itemCount: number;
  source: "redis" | "file" | "memory" | "missing";
  writtenAt: string | null;
  ageSeconds: number;
  bandCounts: Record<ConsensusVerdictBand, number>;
  sourceStats: Record<ConsensusExternalSource, { count: number; rows: number }>;
} {
  const entry = reader.getEntry();
  const payload = entry?.payload ?? EMPTY_PAYLOAD;
  return {
    computedAt: payload.computedAt,
    itemCount: payload.itemCount,
    source: entry?.source ?? "missing",
    writtenAt: entry?.writtenAt ?? null,
    ageSeconds: entry ? Math.max(0, Math.floor(entry.ageMs / 1000)) : 0,
    bandCounts: payload.bandCounts,
    sourceStats: payload.sourceStats,
  };
}

export const _resetConsensusTrendingCacheForTests = reader.reset;
