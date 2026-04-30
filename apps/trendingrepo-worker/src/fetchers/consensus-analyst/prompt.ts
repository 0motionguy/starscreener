// AI Analyst system prompt — Consensus Intelligence Report (per the spec).
// Kept as a single multi-K block so prompt caching covers the entire prefix.

import { z } from 'zod';
import type {
  ConsensusExternalSource,
  ConsensusItem,
  ConsensusVerdictBand,
} from '../consensus-trending/types.js';

export const SYSTEM_PROMPT = `You are the TrendingRepo AI Analyst.

Your job: analyze multi-source signals and determine whether something is a real emerging trend or noise.

Be skeptical, evidence-driven, and structured. Lean investor + engineer.

CORE RULES
- Hype ≠ importance. Volume ≠ credibility.
- Cross-source confirmation is required for strong signals. One source = weak.
- Prefer credible sources over volume. Identify manipulation, spam, recycled content.
- Be concise but precise. Justify with evidence, not adjectives.
- No hedging. No fluff. Evidence > opinion.

INPUT
You receive a JSON object with:
- entity: { fullName, type } — repository, model, or skill identifier
- consensus: { score, confidence, verdict, sourceCount, externalRank, oursRank, maxRankGap }
- sources: per-source rank/score (gh, hf, hn, x, r, pdh, dev, bs, ours)
- weights: source weights used by the composite

VERDICT BANDS
- strong_consensus: ≥5 sources agree, low rank gap. Real signal.
- early_call: we (ours) ranked it ≥20 places before external feeds noticed.
- divergence: 2+ sources disagree by >30 ranks. Investigate.
- external_only: external feeds noticed, our pipeline missed it.
- single_source: only one feed. Weakest signal — likely noise or fake.

OUTPUT
You must respond with ONLY a JSON object matching this schema. No prose around it. No code fences.

{
  "summary": "1-2 sentence paragraph: what is happening, why it matters or doesn't.",
  "scores": {
    "momentum": 0-100,
    "credibility": 0-100,
    "crossSource": 0-100,
    "developerAdoption": 0-100,
    "marketRelevance": 0-100,
    "hypeRisk": 0-100
  },
  "evidence": ["concrete data point 1", "data point 2", "data point 3"],
  "contrarian": "Why this might not matter — what could fail, missing signals.",
  "verdict": "strong" | "early" | "weak" | "noise",
  "confidence": 0-100,
  "whyNow": "What changed recently to surface this.",
  "whatToDo": "watch" | "build" | "ignore" | "research",
  "whatToDoDetail": "1 sentence — actionable, specific."
}

INTERNAL PROCESS (apply silently before producing JSON)
1. BULL CASE — strongest argument the signal is real.
2. BEAR CASE — strongest argument it's noise, hype, or fake.
3. EVIDENCE — what data points anchor each side.
4. SYNTHESIS — final verdict based on weight of evidence.

Do not output the four-step reasoning. Output only the JSON.

CALIBRATION
- "strong" requires ≥5 sources OR ≥3 sources with high engagement (HN front page + GH velocity).
- "early" requires us seeing it before ≥3 external feeds.
- "weak" = single source or low credibility (only Reddit, only Bluesky).
- "noise" = signs of fake stars, paid promotion, or single-burst with no follow-through.

Be willing to call something "noise" or "weak" even if score looks high.`;

export const RIBBON_SYSTEM_PROMPT = `You are the TrendingRepo Daily Verdict editor.

You receive pool-level statistics and the top consensus picks for the day.
Produce a tight daily summary for the verdict ribbon.

Output ONLY a JSON object matching this schema. No prose around it.

{
  "headline": "One sentence (≤25 words). Lead with the biggest signal of the day.",
  "bullets": [
    "4–6 short bullets. Each ≤22 words. Cover: top consensus pick, validated early calls, hottest divergence, external-only standout, cooling/declining repos.",
    "Use entity names verbatim (owner/name format)."
  ],
  "poolNote": "Optional one-sentence pool-level note (e.g. concordance is unusually high/low today)."
}

STYLE
- No hedge language ("might", "could", "perhaps").
- Cite specific entity names (owner/repo) in bullets.
- Pool stats are facts; reference them directly.
- Imperative voice. No filler.`;

const SignalScoresSchema = z.object({
  momentum: z.number().min(0).max(100),
  credibility: z.number().min(0).max(100),
  crossSource: z.number().min(0).max(100),
  developerAdoption: z.number().min(0).max(100),
  marketRelevance: z.number().min(0).max(100),
  hypeRisk: z.number().min(0).max(100),
});

export const ItemReportSchema = z.object({
  summary: z.string().min(1),
  scores: SignalScoresSchema,
  evidence: z.array(z.string()).min(1).max(8),
  contrarian: z.string().min(1),
  verdict: z.enum(['strong', 'early', 'weak', 'noise']),
  confidence: z.number().min(0).max(100),
  whyNow: z.string().min(1),
  whatToDo: z.enum(['watch', 'build', 'ignore', 'research']),
  whatToDoDetail: z.string().min(1),
});

export const RibbonSchema = z.object({
  headline: z.string().min(1).max(280),
  bullets: z.array(z.string().min(1).max(280)).min(2).max(8),
  poolNote: z.string().optional(),
});

export type ItemReport = z.infer<typeof ItemReportSchema>;
export type Ribbon = z.infer<typeof RibbonSchema>;

export interface AnalystUserMessageContext {
  poolSize: number;
  bandCounts: Record<ConsensusVerdictBand, number>;
  sourceStats: Record<ConsensusExternalSource, { count: number; rows: number }>;
  weights: Record<ConsensusExternalSource, number>;
}

export function buildItemUserMessage(
  item: ConsensusItem,
  ctx: AnalystUserMessageContext,
): string {
  const sources = Object.fromEntries(
    Object.entries(item.sources)
      .filter(([, c]) => c.present)
      .map(([k, c]) => [k, { rank: c.rank, score: c.score, normalized: Number(c.normalized.toFixed(3)) }]),
  );
  return JSON.stringify(
    {
      entity: { fullName: item.fullName, type: detectEntityType(item.fullName) },
      consensus: {
        score: item.consensusScore,
        confidence: item.confidence,
        verdict: item.verdict,
        sourceCount: item.sourceCount,
        externalRank: item.externalRank,
        oursRank: item.oursRank,
        maxRankGap: item.maxRankGap,
      },
      sources,
      weights: ctx.weights,
      poolContext: {
        poolSize: ctx.poolSize,
        bandCounts: ctx.bandCounts,
        sourceStats: ctx.sourceStats,
      },
    },
    null,
    2,
  );
}

export function buildRibbonUserMessage(
  topItems: ConsensusItem[],
  ctx: AnalystUserMessageContext,
): string {
  const top = topItems.slice(0, 14).map((item) => ({
    fullName: item.fullName,
    rank: item.rank,
    score: item.consensusScore,
    confidence: item.confidence,
    verdict: item.verdict,
    sourceCount: item.sourceCount,
    oursRank: item.oursRank,
    externalRank: item.externalRank,
  }));
  return JSON.stringify(
    {
      poolStats: {
        size: ctx.poolSize,
        bandCounts: ctx.bandCounts,
        sourceStats: ctx.sourceStats,
        weights: ctx.weights,
      },
      topItems: top,
    },
    null,
    2,
  );
}

function detectEntityType(fullName: string): string {
  const lower = fullName.toLowerCase();
  if (lower.includes('skill')) return 'skill';
  if (lower.startsWith('mcp/') || lower.includes('-mcp')) return 'mcp';
  if (lower.includes('llama') || lower.includes('mistral') || lower.includes('deepseek')) return 'hf_model';
  return 'repo';
}
