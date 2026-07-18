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
- citationCandidates: pre-built {title, url} list of canonical pages on every source where this entity has a present signal. Pick 2-5 of these for "citations" (NEVER invent URLs — only pick from this list).

VERDICT BANDS
- strong_consensus: ≥5 sources agree, low rank gap. Real signal.
- early_call: we (ours) ranked it ≥20 places before external feeds noticed.
- divergence: 2+ sources disagree by >30 ranks. Investigate.
- external_only: external feeds noticed, our pipeline missed it.
- single_source: only one feed. Weakest signal — likely noise or fake.

OUTPUT
You must respond with ONLY a JSON object matching this schema. No prose around it. No code fences.

{
  "tagline": "≤12 words — what this entity IS, in expert framing (e.g. 'open-source agent orchestration framework with built-in tool calling').",
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
  "whatToDoDetail": "1 sentence — actionable, specific.",
  "citations": [{ "title": "string ≤80 chars", "url": "MUST be from input citationCandidates" }]
}

CITATION RULES
- Output 2-5 citations. Pick from input citationCandidates ONLY. Never invent a URL.
- Prefer citations from sources where the entity ranked best (lowest rank number).
- ALWAYS include the GitHub URL when present. Never duplicate the same URL twice.
- If citationCandidates has fewer than 2 entries, output exactly what's there.

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

// Citation row — {title, url}. URL must be a real https URL (Zod `.url()`
// would also accept ftp://, custom schemes; we constrain to https here so a
// hallucinated `javascript:` or relative URL can't leak through and break
// the renderer's `_blank` target chain on the profile page). Title is
// clamped to 80 chars; over-long titles get dropped to keep the source row
// readable.
export const CitationSchema = z.object({
  title: z.string().min(1).max(80),
  url: z.string().regex(/^https:\/\/[^\s]+$/i, 'https URL required'),
});

export const ItemReportSchema = z.object({
  // tagline + citations are optional during the rolling deploy so existing
  // 505 backfilled items (without these fields) still validate when
  // re-read by the read-then-merge path. Fresh items SHOULD populate both,
  // but the schema doesn't reject older payloads.
  tagline: z.string().min(1).max(160).optional(),
  summary: z.string().min(1),
  scores: SignalScoresSchema,
  // 2026-06-11 (Wave B): evidence + contrarian are now tolerant of partial
  // LLM responses. Kimi K2.6 and NanoGPT both occasionally return objects
  // with these fields missing or null (~0.3% rate on top-30, expected to be
  // higher on the expanded TOP_N=75 cohort where long-tail repos have weaker
  // signals → harder reasoning). Dropping the entire verdict for a missing
  // contrarian or empty evidence array is wasteful — we still have a usable
  // tagline + summary + scores + verdict for the FeaturedRepos slot. Verdict
  // and scores stay strict because an invalid verdict would label the repo
  // incorrectly in rankings.
  evidence: z.array(z.string()).max(8).default([]),
  contrarian: z.string().default(''),
  verdict: z.enum(['strong', 'early', 'weak', 'noise']),
  confidence: z.number().min(0).max(100),
  whyNow: z.string().min(1),
  whatToDo: z.enum(['watch', 'build', 'ignore', 'research']),
  whatToDoDetail: z.string().min(1),
  citations: z.array(CitationSchema).max(8).optional(),
});

export const RibbonSchema = z.object({
  headline: z.string().min(1).max(280),
  bullets: z.array(z.string().min(1).max(280)).min(2).max(8),
  poolNote: z.string().optional(),
});

export type Citation = z.infer<typeof CitationSchema>;
export type ItemReport = z.infer<typeof ItemReportSchema>;
export type Ribbon = z.infer<typeof RibbonSchema>;

export interface AnalystUserMessageContext {
  poolSize: number;
  bandCounts: Record<ConsensusVerdictBand, number>;
  sourceStats: Record<ConsensusExternalSource, { count: number; rows: number }>;
  weights: Record<ConsensusExternalSource, number>;
}

// Per-source URL pattern. Each function returns a canonical https URL where
// the entity has a discoverable presence on that source. Some sources have a
// stable per-entity page (GitHub, HuggingFace); others only support search
// (HN, Reddit, X, Bluesky, ProductHunt, Dev.to). Either way the URL is real
// — Kimi is told to pick from this list verbatim, never invent.
const SOURCE_URL_BUILDERS: Record<
  ConsensusExternalSource,
  { title: (fullName: string) => string; url: (fullName: string) => string }
> = {
  gh: {
    title: (n) => `GitHub: ${n}`,
    url: (n) => `https://github.com/${n}`,
  },
  hf: {
    title: (n) => `HuggingFace: ${n}`,
    url: (n) => `https://huggingface.co/${n}`,
  },
  hn: {
    title: (n) => `Hacker News mentions of ${n}`,
    url: (n) => `https://hn.algolia.com/?q=${encodeURIComponent(n)}&sort=byPopularity`,
  },
  x: {
    title: (n) => `X (Twitter) search: ${n}`,
    url: (n) => `https://x.com/search?q=${encodeURIComponent(n)}&src=typed_query`,
  },
  r: {
    title: (n) => `Reddit search: ${n}`,
    url: (n) => `https://www.reddit.com/search/?q=${encodeURIComponent(n)}`,
  },
  pdh: {
    title: (n) => `Product Hunt search: ${n}`,
    url: (n) => `https://www.producthunt.com/search?q=${encodeURIComponent(n)}`,
  },
  dev: {
    title: (n) => `dev.to search: ${n}`,
    url: (n) => `https://dev.to/search?q=${encodeURIComponent(n)}`,
  },
  bs: {
    title: (n) => `Bluesky search: ${n}`,
    url: (n) => `https://bsky.app/search?q=${encodeURIComponent(n)}`,
  },
};

/**
 * Build the citation candidate list for a given consensus item. Returns one
 * entry per external source where the item has a present signal. Sorted by
 * source rank (best/lowest rank first) so Kimi's top picks come from the
 * strongest sources. GitHub is always returned first when present.
 *
 * Exported so unit tests can validate the URL-building logic without going
 * through the full LLM call shape.
 */
export function buildCitationCandidates(item: ConsensusItem): Citation[] {
  const candidates: Array<Citation & { sortKey: number }> = [];
  for (const src of Object.keys(SOURCE_URL_BUILDERS) as ConsensusExternalSource[]) {
    const component = item.sources[src];
    if (!component || !component.present) continue;
    const builder = SOURCE_URL_BUILDERS[src];
    // Sort by rank — lower rank = stronger signal = better candidate. GitHub
    // gets a tiebreaker bonus (sortKey -1000 floor) so it always leads when
    // present, since it's the canonical home for repos.
    const rank = typeof component.rank === 'number' ? component.rank : 9999;
    const sortKey = src === 'gh' ? -1000 + rank : rank;
    candidates.push({
      title: builder.title(item.fullName),
      url: builder.url(item.fullName),
      sortKey,
    });
  }
  candidates.sort((a, b) => a.sortKey - b.sortKey);
  return candidates.map(({ title, url }) => ({ title: title.slice(0, 80), url }));
}

/**
 * Convert unreliable model JSON into the strict report contract using only
 * facts already present in the consensus item. Model prose wins when valid;
 * missing load-bearing fields get deterministic, non-hallucinated defaults.
 */
export function normalizeItemReport(raw: unknown, item: ConsensusItem): ItemReport {
  const input = isRecord(raw) ? raw : {};
  const rawScores = isRecord(input.scores) ? input.scores : {};
  const derivedScores = {
    momentum: score(item.consensusScore),
    credibility: score(item.confidence),
    crossSource: score((item.sourceCount / 8) * 100),
    developerAdoption: score(item.sources.gh.normalized * 100),
    marketRelevance: score((item.consensusScore + item.confidence) / 2),
    hypeRisk: score(100 - item.confidence),
  };
  const verdict = isVerdict(input.verdict)
    ? input.verdict
    : item.verdict === 'strong_consensus'
      ? 'strong'
      : item.verdict === 'early_call'
        ? 'early'
        : 'weak';
  const fallbackAction = verdict === 'strong' || verdict === 'early' ? 'watch' : 'research';
  const tagline = cleanString(input.tagline)?.slice(0, 160);
  const allowedCitations = new Map(buildCitationCandidates(item).map((citation) => [citation.url, citation]));
  const citations = Array.isArray(input.citations)
    ? input.citations
        .map((citation) => (isRecord(citation) && typeof citation.url === 'string'
          ? allowedCitations.get(citation.url)
          : undefined))
        .filter((citation): citation is Citation => Boolean(citation))
        .slice(0, 8)
    : [];

  return ItemReportSchema.parse({
    ...(tagline ? { tagline } : {}),
    summary:
      cleanString(input.summary) ??
      `${item.fullName} ranks #${item.rank} with ${item.sourceCount}-source confirmation and a consensus score of ${score(item.consensusScore)}.`,
    scores: {
      momentum: score(rawScores.momentum, derivedScores.momentum),
      credibility: score(rawScores.credibility, derivedScores.credibility),
      crossSource: score(rawScores.crossSource, derivedScores.crossSource),
      developerAdoption: score(rawScores.developerAdoption, derivedScores.developerAdoption),
      marketRelevance: score(rawScores.marketRelevance, derivedScores.marketRelevance),
      hypeRisk: score(rawScores.hypeRisk, derivedScores.hypeRisk),
    },
    evidence: Array.isArray(input.evidence)
      ? input.evidence
          .map(cleanString)
          .filter((value): value is string => Boolean(value))
          .slice(0, 8)
      : [],
    contrarian: cleanString(input.contrarian) ?? '',
    verdict,
    confidence: score(input.confidence, item.confidence),
    whyNow:
      cleanString(input.whyNow) ??
      `${item.fullName} is currently ranked #${item.rank} across ${item.sourceCount} external sources.`,
    whatToDo: isAction(input.whatToDo) ? input.whatToDo : fallbackAction,
    whatToDoDetail:
      cleanString(input.whatToDoDetail) ??
      'Review the current source mix and rank movement before acting.',
    ...(citations.length > 0 ? { citations } : {}),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned || undefined;
}

function score(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.round(Math.max(0, Math.min(100, numeric)));
}

function isVerdict(value: unknown): value is ItemReport['verdict'] {
  return value === 'strong' || value === 'early' || value === 'weak' || value === 'noise';
}

function isAction(value: unknown): value is ItemReport['whatToDo'] {
  return value === 'watch' || value === 'build' || value === 'ignore' || value === 'research';
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
  const citationCandidates = buildCitationCandidates(item);
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
      citationCandidates,
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
