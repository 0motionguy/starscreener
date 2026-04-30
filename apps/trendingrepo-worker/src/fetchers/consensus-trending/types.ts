// Consensus v3: 1 internal source ("ours") + 8 external sources.
// External weights sum to 1.0 (gh+hf+hn+x+r+pdh+dev+bs).
// "ours" sits outside the external weighting — used for verdict-band
// classification (early-call detection, divergence vs external composite).
export type ConsensusInternalSource = 'ours';

export type ConsensusExternalSource =
  | 'gh'
  | 'hf'
  | 'hn'
  | 'x'
  | 'r'
  | 'pdh'
  | 'dev'
  | 'bs';

export type ConsensusSource = ConsensusInternalSource | ConsensusExternalSource;

export type ConsensusVerdictBand =
  | 'strong_consensus'
  | 'early_call'
  | 'divergence'
  | 'external_only'
  | 'single_source';

export interface ConsensusSourceInput {
  fullName: string;
  rank: number;
  score?: number;
}

export interface ConsensusScoreInput {
  ours: ConsensusSourceInput[];
  gh: ConsensusSourceInput[];
  hf: ConsensusSourceInput[];
  hn: ConsensusSourceInput[];
  x: ConsensusSourceInput[];
  r: ConsensusSourceInput[];
  pdh: ConsensusSourceInput[];
  dev: ConsensusSourceInput[];
  bs: ConsensusSourceInput[];
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
  /** 0–100. weight_sum_of_present_sources × concordance_factor × 100. */
  confidence: number;
  /** Count of external sources present (0–8). */
  sourceCount: number;
  /** Rank in the external composite ranking (post-fusion, 1-N). null if no external sources. */
  externalRank: number | null;
  /** Internal pipeline rank from "ours". null if absent from "ours". */
  oursRank: number | null;
  /** Largest pairwise rank gap among present external sources (0 if ≤1 present). */
  maxRankGap: number;
  verdict: ConsensusVerdictBand;
  sources: Record<ConsensusSource, ConsensusSourceComponent>;
}

export interface ConsensusTrendingPayload {
  computedAt: string;
  itemCount: number;
  weights: Record<ConsensusExternalSource, number>;
  /** Per-source ingestion stats for the source strip on the page. */
  sourceStats: Record<ConsensusExternalSource, { count: number; rows: number }>;
  /** Pool-level rollup counts (one per verdict band). */
  bandCounts: Record<ConsensusVerdictBand, number>;
  items: ConsensusItem[];
}
