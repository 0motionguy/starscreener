import type {
  ConsensusExternalSource,
  ConsensusItem,
  ConsensusScoreInput,
  ConsensusSource,
  ConsensusSourceComponent,
  ConsensusSourceInput,
  ConsensusVerdictBand,
} from './types.js';

export const CONSENSUS_WEIGHTS: Record<ConsensusExternalSource, number> = {
  gh: 0.20,
  hf: 0.18,
  hn: 0.16,
  x: 0.14,
  r: 0.10,
  pdh: 0.08,
  dev: 0.08,
  bs: 0.06,
};

export const EXTERNAL_SOURCES: readonly ConsensusExternalSource[] = [
  'gh', 'hf', 'hn', 'x', 'r', 'pdh', 'dev', 'bs',
] as const;

const ALL_SOURCES: readonly ConsensusSource[] = [
  'ours', ...EXTERNAL_SOURCES,
] as const;

const STRONG_MIN_SOURCES = 5;
const STRONG_MAX_GAP = 30;
const EARLY_OURS_LEAD = 20;
const DIVERGENCE_GAP = 30;

interface Candidate {
  fullName: string;
  lower: string;
  sources: Record<ConsensusSource, ConsensusSourceComponent>;
}

function emptyComponent(): ConsensusSourceComponent {
  return { present: false, rank: null, score: null, normalized: 0 };
}

function emptySources(): Record<ConsensusSource, ConsensusSourceComponent> {
  return Object.fromEntries(
    ALL_SOURCES.map((k) => [k, emptyComponent()]),
  ) as Record<ConsensusSource, ConsensusSourceComponent>;
}

function normalizeFullName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.includes('/')) return null;
  const [owner, name] = trimmed.split('/');
  if (!owner || !name) return null;
  return `${owner}/${name}`;
}

function rankToNormalized(rank: number): number {
  if (!Number.isFinite(rank) || rank <= 0) return 0;
  return 1 / Math.sqrt(rank);
}

function componentFor(row: ConsensusSourceInput, fallbackRank: number): ConsensusSourceComponent {
  const rank = Number.isFinite(row.rank) && row.rank > 0 ? Math.trunc(row.rank) : fallbackRank;
  return {
    present: true,
    rank,
    score: typeof row.score === 'number' && Number.isFinite(row.score) ? row.score : null,
    normalized: rankToNormalized(rank),
  };
}

function upsertRows(
  candidates: Map<string, Candidate>,
  source: ConsensusSource,
  rows: ConsensusSourceInput[],
): void {
  rows.forEach((row, idx) => {
    const fullName = normalizeFullName(row.fullName);
    if (!fullName) return;
    const lower = fullName.toLowerCase();
    let candidate = candidates.get(lower);
    if (!candidate) {
      candidate = { fullName, lower, sources: emptySources() };
      candidates.set(lower, candidate);
    }
    const next = componentFor(row, idx + 1);
    const prev = candidate.sources[source];
    if (!prev.present || (next.rank ?? Infinity) < (prev.rank ?? Infinity)) {
      candidate.sources[source] = next;
    }
  });
}

function externalSourceCount(sources: Record<ConsensusSource, ConsensusSourceComponent>): number {
  return EXTERNAL_SOURCES.reduce((acc, k) => acc + (sources[k].present ? 1 : 0), 0);
}

function maxRankGap(sources: Record<ConsensusSource, ConsensusSourceComponent>): number {
  const ranks = EXTERNAL_SOURCES
    .map((k) => sources[k].rank)
    .filter((r): r is number => typeof r === 'number');
  if (ranks.length < 2) return 0;
  return Math.max(...ranks) - Math.min(...ranks);
}

/**
 * Concordance factor: pairwise rank agreement among present external sources.
 * Returns a multiplier in [0.6, 1.0] applied to the weight-sum confidence.
 * Sources that all rank a candidate similarly → 1.0. Wide spread → 0.6.
 */
function concordanceFactor(sources: Record<ConsensusSource, ConsensusSourceComponent>): number {
  const ranks = EXTERNAL_SOURCES
    .map((k) => sources[k].rank)
    .filter((r): r is number => typeof r === 'number');
  if (ranks.length < 2) return 1.0;
  const gap = Math.max(...ranks) - Math.min(...ranks);
  // Normalize: gap 0 → 1.0; gap 100 → 0.6. Clamp.
  const factor = 1.0 - Math.min(1, gap / 100) * 0.4;
  return Math.max(0.6, Math.min(1.0, factor));
}

function externalWeightedScore(
  sources: Record<ConsensusSource, ConsensusSourceComponent>,
): number {
  let weighted = 0;
  for (const k of EXTERNAL_SOURCES) {
    weighted += sources[k].normalized * CONSENSUS_WEIGHTS[k];
  }
  return weighted;
}

function consensusScore(sources: Record<ConsensusSource, ConsensusSourceComponent>): number {
  const weighted = externalWeightedScore(sources);
  const count = externalSourceCount(sources);
  const coverageBonus = count >= STRONG_MIN_SOURCES ? 0.15 : count >= 3 ? 0.08 : 0;
  return Math.max(0, Math.min(100, (weighted + coverageBonus) * 100));
}

function confidenceFor(sources: Record<ConsensusSource, ConsensusSourceComponent>): number {
  let weightSum = 0;
  for (const k of EXTERNAL_SOURCES) {
    if (sources[k].present) weightSum += CONSENSUS_WEIGHTS[k];
  }
  const factor = concordanceFactor(sources);
  return Math.max(0, Math.min(100, Math.round(weightSum * factor * 100)));
}

function classifyVerdict(
  sources: Record<ConsensusSource, ConsensusSourceComponent>,
  oursRank: number | null,
  externalRank: number | null,
): ConsensusVerdictBand {
  const count = externalSourceCount(sources);
  const oursPresent = sources.ours.present;
  const gap = maxRankGap(sources);

  if (count >= STRONG_MIN_SOURCES && gap <= STRONG_MAX_GAP) {
    return 'strong_consensus';
  }
  if (
    oursPresent &&
    typeof oursRank === 'number' &&
    typeof externalRank === 'number' &&
    oursRank + EARLY_OURS_LEAD <= externalRank
  ) {
    return 'early_call';
  }
  if (count >= 2 && gap > DIVERGENCE_GAP) {
    return 'divergence';
  }
  if (!oursPresent && count >= 2) {
    return 'external_only';
  }
  return 'single_source';
}

export function scoreConsensus(input: ConsensusScoreInput): ConsensusItem[] {
  const candidates = new Map<string, Candidate>();
  upsertRows(candidates, 'ours', input.ours);
  for (const k of EXTERNAL_SOURCES) {
    upsertRows(candidates, k, input[k]);
  }

  // First pass: compute consensus score per candidate. Used to derive externalRank.
  const scored = Array.from(candidates.values()).map((c) => ({
    candidate: c,
    score: consensusScore(c.sources),
  }));

  // Sort by externalWeightedScore (proxy for external rank). Ties broken by source count.
  const externalOrdered = [...scored].sort((a, b) => {
    const aWeighted = externalWeightedScore(a.candidate.sources);
    const bWeighted = externalWeightedScore(b.candidate.sources);
    if (bWeighted !== aWeighted) return bWeighted - aWeighted;
    const aCount = externalSourceCount(a.candidate.sources);
    const bCount = externalSourceCount(b.candidate.sources);
    if (bCount !== aCount) return bCount - aCount;
    return a.candidate.fullName.localeCompare(b.candidate.fullName);
  });
  const externalRankByLower = new Map<string, number>();
  externalOrdered.forEach((entry, idx) => {
    if (externalSourceCount(entry.candidate.sources) > 0) {
      externalRankByLower.set(entry.candidate.lower, idx + 1);
    }
  });

  const items: ConsensusItem[] = scored.map(({ candidate, score }) => {
    const oursRank = candidate.sources.ours.rank ?? null;
    const externalRank = externalRankByLower.get(candidate.lower) ?? null;
    const verdict = classifyVerdict(candidate.sources, oursRank, externalRank);
    return {
      fullName: candidate.fullName,
      rank: 0,
      consensusScore: Math.round(score * 10) / 10,
      confidence: confidenceFor(candidate.sources),
      sourceCount: externalSourceCount(candidate.sources),
      externalRank,
      oursRank,
      maxRankGap: maxRankGap(candidate.sources),
      verdict,
      sources: candidate.sources,
    };
  });

  items.sort((a, b) => {
    if (b.consensusScore !== a.consensusScore) return b.consensusScore - a.consensusScore;
    if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount;
    return a.fullName.localeCompare(b.fullName);
  });

  const limit = Math.max(0, Math.trunc(input.limit ?? Number.POSITIVE_INFINITY));
  const truncated = items.slice(0, Math.min(limit, items.length));
  truncated.forEach((item, idx) => {
    item.rank = idx + 1;
  });
  return truncated;
}

export function bandCounts(items: ConsensusItem[]): Record<ConsensusVerdictBand, number> {
  const counts: Record<ConsensusVerdictBand, number> = {
    strong_consensus: 0,
    early_call: 0,
    divergence: 0,
    external_only: 0,
    single_source: 0,
  };
  for (const item of items) counts[item.verdict] += 1;
  return counts;
}
