import { createPayloadReader } from "./data-store-reader";

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

export type ConsensusGenerator = "kimi" | "nanogpt" | "template";

export interface ConsensusVerdictsPayload {
  computedAt: string;
  generator: ConsensusGenerator;
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

// No publicly stale batches. Verdicts older than this fall through to null
// (callers render an empty/degraded UI instead of a stale row). Override via
// `CONSENSUS_MAX_AGE_HOURS` if needed.
const DEFAULT_MAX_AGE_HOURS = 48;

function consensusMaxAgeHours(): number {
  const raw = process.env.CONSENSUS_MAX_AGE_HOURS;
  if (!raw) return DEFAULT_MAX_AGE_HOURS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_AGE_HOURS;
  return parsed;
}

export function isConsensusPayloadFresh(payload: ConsensusVerdictsPayload): boolean {
  if (!payload.computedAt) return false;
  const ts = Date.parse(payload.computedAt);
  if (!Number.isFinite(ts)) return false;
  const ageMs = Date.now() - ts;
  const maxMs = consensusMaxAgeHours() * 60 * 60 * 1000;
  return ageMs >= 0 && ageMs <= maxMs;
}

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
  const generator: ConsensusGenerator =
    p.generator === "kimi" ? "kimi" : p.generator === "nanogpt" ? "nanogpt" : "template";
  return {
    computedAt: typeof p.computedAt === "string" ? p.computedAt : "",
    generator,
    model: typeof p.model === "string" ? p.model : undefined,
    ribbon,
    items,
  };
}

const reader = createPayloadReader<ConsensusVerdictsPayload>({
  key: "consensus-verdicts",
  emptyPayload: EMPTY,
  normalize: normalizePayload,
});

export const refreshConsensusVerdictsFromStore = reader.refresh;

export const getConsensusVerdictsPayload = reader.getPayload;

export function getConsensusItemReport(fullName: string): ConsensusItemReport | null {
  const payload = reader.getPayload();
  if (!isConsensusPayloadFresh(payload)) return null;
  return payload.items[fullName] ?? payload.items[fullName.toLowerCase()] ?? null;
}

// Fresh-only accessor — returns EMPTY when the cached payload is past
// `CONSENSUS_MAX_AGE_HOURS`. Use on publicly-rendered surfaces (homepage,
// per-repo detail, daily-verdict panel) so stale batches never reach users.
export function getFreshConsensusVerdictsPayload(): ConsensusVerdictsPayload {
  const payload = reader.getPayload();
  return isConsensusPayloadFresh(payload) ? payload : EMPTY;
}

export const _resetConsensusVerdictsCacheForTests = reader.reset;
