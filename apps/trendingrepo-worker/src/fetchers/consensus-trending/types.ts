export type ConsensusSource = 'ours' | 'oss' | 'trendshift';

export type ConsensusBadge =
  | 'consensus_pick'
  | 'our_early_signal'
  | 'external_breakout'
  | 'divergence';

export interface ConsensusSourceInput {
  fullName: string;
  rank: number;
  score?: number;
}

export interface ConsensusScoreInput {
  ours: ConsensusSourceInput[];
  oss: ConsensusSourceInput[];
  trendshift: ConsensusSourceInput[];
  limit?: number;
}

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
