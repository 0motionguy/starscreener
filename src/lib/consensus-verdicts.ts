import { getDataStore } from "./data-store";

export interface ConsensusSignalScores {
  momentum: number;
  credibility: number;
  crossSource: number;
  developerAdoption: number;
  marketRelevance: number;
  hypeRisk: number;
}

export type AnalystAction = "watch" | "build" | "ignore" | "research";

export type AnalystVerdict = "strong" | "early" | "weak" | "noise";

export interface ConsensusItemReport {
  fullName: string;
  summary: string;
  scores: ConsensusSignalScores;
  evidence: string[];
  contrarian: string;
  verdict: AnalystVerdict;
  confidence: number;
  whyNow: string;
  whatToDo: AnalystAction;
  whatToDoDetail: string;
}

export interface ConsensusRibbonReport {
  /** Single sentence — top headline. */
  headline: string;
  /** 4–6 bullets for the Daily Verdict panel. */
  bullets: string[];
  /** Optional pool-level confidence note. */
  poolNote?: string;
}

export interface ConsensusVerdictsPayload {
  computedAt: string;
  generator: "kimi" | "template";
  model?: string;
  ribbon: ConsensusRibbonReport;
  items: Record<string, ConsensusItemReport>;
}

const EMPTY: ConsensusVerdictsPayload = {
  computedAt: "",
  generator: "template",
  ribbon: { headline: "", bullets: [] },
  items: {},
};

interface CacheEntry {
  payload: ConsensusVerdictsPayload;
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

function asAction(value: unknown): AnalystAction {
  if (value === "watch" || value === "build" || value === "ignore" || value === "research") {
    return value;
  }
  return "watch";
}

function asVerdict(value: unknown): AnalystVerdict {
  if (value === "strong" || value === "early" || value === "weak" || value === "noise") {
    return value;
  }
  return "weak";
}

function clamp01_100(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function normalizeScores(input: unknown): ConsensusSignalScores {
  const s = (input && typeof input === "object" ? input : {}) as Partial<ConsensusSignalScores>;
  return {
    momentum: clamp01_100(s.momentum),
    credibility: clamp01_100(s.credibility),
    crossSource: clamp01_100(s.crossSource),
    developerAdoption: clamp01_100(s.developerAdoption),
    marketRelevance: clamp01_100(s.marketRelevance),
    hypeRisk: clamp01_100(s.hypeRisk),
  };
}

function normalizeItem(input: unknown): ConsensusItemReport | null {
  if (!input || typeof input !== "object") return null;
  const it = input as Partial<ConsensusItemReport>;
  if (typeof it.fullName !== "string") return null;
  return {
    fullName: it.fullName,
    summary: typeof it.summary === "string" ? it.summary : "",
    scores: normalizeScores(it.scores),
    evidence: Array.isArray(it.evidence) ? it.evidence.filter((e): e is string => typeof e === "string") : [],
    contrarian: typeof it.contrarian === "string" ? it.contrarian : "",
    verdict: asVerdict(it.verdict),
    confidence: clamp01_100(it.confidence),
    whyNow: typeof it.whyNow === "string" ? it.whyNow : "",
    whatToDo: asAction(it.whatToDo),
    whatToDoDetail: typeof it.whatToDoDetail === "string" ? it.whatToDoDetail : "",
  };
}

function normalizePayload(input: unknown): ConsensusVerdictsPayload {
  if (!input || typeof input !== "object") return EMPTY;
  const p = input as Partial<ConsensusVerdictsPayload>;
  const items: Record<string, ConsensusItemReport> = {};
  if (p.items && typeof p.items === "object") {
    for (const [k, v] of Object.entries(p.items as Record<string, unknown>)) {
      const item = normalizeItem(v);
      if (item) items[k] = item;
    }
  }
  const ribbon: ConsensusRibbonReport = {
    headline: typeof p.ribbon?.headline === "string" ? p.ribbon.headline : "",
    bullets: Array.isArray(p.ribbon?.bullets)
      ? p.ribbon!.bullets.filter((b): b is string => typeof b === "string")
      : [],
    poolNote: typeof p.ribbon?.poolNote === "string" ? p.ribbon.poolNote : undefined,
  };
  return {
    computedAt: typeof p.computedAt === "string" ? p.computedAt : "",
    generator: p.generator === "kimi" ? "kimi" : "template",
    model: typeof p.model === "string" ? p.model : undefined,
    ribbon,
    items,
  };
}

export async function refreshConsensusVerdictsFromStore(): Promise<RefreshResult> {
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
      const result = await store.read<unknown>("consensus-verdicts");
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

export function getConsensusVerdictsPayload(): ConsensusVerdictsPayload {
  return cache?.payload ?? EMPTY;
}

export function getConsensusItemReport(fullName: string): ConsensusItemReport | null {
  const payload = cache?.payload ?? EMPTY;
  return payload.items[fullName] ?? payload.items[fullName.toLowerCase()] ?? null;
}

export function _resetConsensusVerdictsCacheForTests(): void {
  cache = null;
  lastRefreshMs = 0;
  inflight = null;
}
