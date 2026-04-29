import type {
  ConsensusBadge,
  ConsensusItem,
  ConsensusScoreInput,
  ConsensusSource,
  ConsensusSourceComponent,
  ConsensusSourceInput,
} from './types.js';

export const CONSENSUS_WEIGHTS: Record<ConsensusSource, number> = {
  ours: 0.45,
  oss: 0.25,
  trendshift: 0.30,
};

const SOURCE_KEYS: readonly ConsensusSource[] = ['ours', 'oss', 'trendshift'] as const;

interface Candidate {
  fullName: string;
  lower: string;
  sources: Record<ConsensusSource, ConsensusSourceComponent>;
}

function emptyComponent(): ConsensusSourceComponent {
  return {
    present: false,
    rank: null,
    score: null,
    normalized: 0,
  };
}

function emptySources(): Record<ConsensusSource, ConsensusSourceComponent> {
  return {
    ours: emptyComponent(),
    oss: emptyComponent(),
    trendshift: emptyComponent(),
  };
}

function normalizeFullName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.includes('/')) return null;
  const [owner, name] = trimmed.split('/');
  if (!owner || !name) return null;
  return `${owner}/${name}`;
}

function normalizeRank(rank: number): number {
  if (!Number.isFinite(rank) || rank <= 0) return 0;
  return 1 / Math.sqrt(rank);
}

function normalizeOursScore(score: number | undefined, rank: number): number {
  if (typeof score === 'number' && Number.isFinite(score) && score > 0) {
    return Math.max(0, Math.min(1, score / 100));
  }
  return normalizeRank(rank);
}

function normalizeExternalScore(rank: number): number {
  return normalizeRank(rank);
}

function componentFor(
  source: ConsensusSource,
  row: ConsensusSourceInput,
): ConsensusSourceComponent {
  const rank = Number.isFinite(row.rank) && row.rank > 0 ? Math.trunc(row.rank) : 999;
  return {
    present: true,
    rank,
    score: typeof row.score === 'number' && Number.isFinite(row.score) ? row.score : null,
    normalized:
      source === 'ours'
        ? normalizeOursScore(row.score, rank)
        : normalizeExternalScore(rank),
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
    const candidate =
      candidates.get(lower) ??
      {
        fullName,
        lower,
        sources: emptySources(),
      };
    const effectiveRow = {
      ...row,
      rank: Number.isFinite(row.rank) && row.rank > 0 ? row.rank : idx + 1,
    };
    const next = componentFor(source, effectiveRow);
    const prev = candidate.sources[source];
    if (!prev.present || (next.rank ?? 999) < (prev.rank ?? 999)) {
      candidate.sources[source] = next;
    }
    candidates.set(lower, candidate);
  });
}

function sourceCount(sources: Record<ConsensusSource, ConsensusSourceComponent>): number {
  return SOURCE_KEYS.reduce((acc, key) => acc + (sources[key].present ? 1 : 0), 0);
}

function computeBadges(sources: Record<ConsensusSource, ConsensusSourceComponent>): ConsensusBadge[] {
  const ours = sources.ours;
  const oss = sources.oss;
  const trendshift = sources.trendshift;
  const badges: ConsensusBadge[] = [];
  const allThree = ours.present && oss.present && trendshift.present;
  const bothExternal = oss.present && trendshift.present;

  if (allThree) badges.push('consensus_pick');
  if (ours.present && !oss.present && !trendshift.present && ours.normalized >= 0.5) {
    badges.push('our_early_signal');
  }
  if (!ours.present && bothExternal) badges.push('external_breakout');
  if (ours.present && bothExternal && ours.normalized < 0.4) badges.push('divergence');
  return badges;
}

function rawScore(sources: Record<ConsensusSource, ConsensusSourceComponent>): number {
  let weighted = 0;
  for (const key of SOURCE_KEYS) {
    weighted += sources[key].normalized * CONSENSUS_WEIGHTS[key];
  }
  const count = sourceCount(sources);
  const coverageBonus = count >= 3 ? 0.12 : count === 2 ? 0.06 : 0;
  return Math.max(0, Math.min(100, (weighted + coverageBonus) * 100));
}

export function scoreConsensus(input: ConsensusScoreInput): ConsensusItem[] {
  const candidates = new Map<string, Candidate>();
  upsertRows(candidates, 'ours', input.ours);
  upsertRows(candidates, 'oss', input.oss);
  upsertRows(candidates, 'trendshift', input.trendshift);

  const limit = Math.max(0, Math.trunc(input.limit ?? Number.POSITIVE_INFINITY));
  const items = Array.from(candidates.values()).map((candidate) => ({
    fullName: candidate.fullName,
    rank: 0,
    consensusScore: Math.round(rawScore(candidate.sources) * 10) / 10,
    sourceCount: sourceCount(candidate.sources),
    badges: computeBadges(candidate.sources),
    sources: candidate.sources,
  }));

  items.sort((a, b) => {
    if (b.consensusScore !== a.consensusScore) return b.consensusScore - a.consensusScore;
    if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount;
    return a.fullName.localeCompare(b.fullName);
  });

  const truncated = items.slice(0, Math.min(limit, items.length));
  truncated.forEach((item, idx) => {
    item.rank = idx + 1;
  });
  return truncated;
}
